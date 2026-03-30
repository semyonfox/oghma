/**
 * Canvas LMS API Client
 *
 * A lightweight wrapper around the Canvas REST API.
 * Handles authentication, pagination, and error cases (including 403s from lecturer-restricted files) in a consistent way so the routes above never need
 * to deal with raw fetch logic.
 *
 * Usage:
 *   const client = new CanvasClient(domain, userToken);
 *   const { data, forbidden, error } = await client.getCourses();
 */

// transient errors worth retrying (network blips, server hiccups)
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function isRetryable(err) {
  return (
    RETRYABLE_CODES.has(err?.code) || RETRYABLE_CODES.has(err?.cause?.code)
  );
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CanvasClient {
  /**
   * @param {string} domain - Canvas institution domain e.g. 'universityofgalway.instructure.com'
   * @param {string} token  - User-generated Canvas API token
   */
  constructor(domain, token) {
    this.baseUrl = `https://${domain}/api/v1`;
    this.token = token;
  }

  /**
   * Makes a single authenticated GET request to Canvas.
   * Returns a consistent { data, forbidden, error } shape so callers never need to handle thrown exceptions.
   *
   * @param {string} path - API path e.g. '/courses/123/files/456'
   * @returns {Promise<{ data: any|null, forbidden: boolean, error?: string }>}
   */
  async #get(path) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
        });

        // respect Canvas rate limit headers — back off when close to limit
        await this.#respectRateLimit(response);

        if (response.status === 403) {
          return {
            data: null,
            forbidden: true,
            error: "Access restricted by lecturer",
          };
        }

        if (response.status === 401) {
          return {
            data: null,
            forbidden: false,
            error: "Invalid or expired Canvas token",
          };
        }

        if (response.status === 429) {
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_BASE_MS * 2 ** attempt);
            continue;
          }
          return {
            data: null,
            forbidden: false,
            error: "Canvas API rate limited — try again later",
          };
        }

        if (!response.ok) {
          return {
            data: null,
            forbidden: false,
            error: `Canvas API error: ${response.status}`,
          };
        }

        const data = await response.json();
        return { data, forbidden: false };
      } catch (err) {
        if (attempt < MAX_RETRIES && isRetryable(err)) {
          await sleep(RETRY_BASE_MS * 2 ** attempt);
          continue;
        }
        return {
          data: null,
          forbidden: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }
  }

  // pauses if Canvas X-Rate-Limit-Remaining header indicates we're close to the limit
  async #respectRateLimit(response) {
    const remaining = response.headers.get("x-rate-limit-remaining");
    if (remaining !== null && parseFloat(remaining) < 10) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Fetches all pages of a paginated Canvas endpoint.
   * Canvas signals the next page via a 'Link' header with rel="next".
   * Requests 100 items per page to minimise round trips.
   *
   * @param {string} path - API path to paginate
   * @returns {Promise<{ data: any[], forbidden: boolean, error?: string }>}
   */
  async #getPaginated(path) {
    const results = [];

    // Append per_page to the initial URL — Canvas default is 10 which is too slow
    let url = `${this.baseUrl}${path}${path.includes("?") ? "&" : "?"}per_page=100`;

    while (url) {
      let pageSuccess = false;
      for (let attempt = 0; attempt <= MAX_RETRIES && !pageSuccess; attempt++) {
        try {
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: "application/json",
            },
          });

          await this.#respectRateLimit(response);

          if (response.status === 403) {
            return {
              data: results,
              forbidden: true,
              error: "Access restricted by lecturer",
            };
          }

          if (response.status === 401) {
            return {
              data: results,
              forbidden: false,
              error: "Invalid or expired Canvas token",
            };
          }

          if (response.status === 429) {
            if (attempt < MAX_RETRIES) {
              await sleep(RETRY_BASE_MS * 2 ** attempt);
              continue;
            }
            return {
              data: results,
              forbidden: false,
              error: "Canvas API rate limited — try again later",
            };
          }

          if (!response.ok) {
            return {
              data: results,
              forbidden: false,
              error: `Canvas API error: ${response.status}`,
            };
          }

          const page = await response.json();
          results.push(...page);

          // Canvas puts the next page URL in the Link header: <url>; rel="next"
          const linkHeader = response.headers.get("Link");
          const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
          url = nextMatch ? nextMatch[1] : null;
          pageSuccess = true;
        } catch (err) {
          if (attempt < MAX_RETRIES && isRetryable(err)) {
            await sleep(RETRY_BASE_MS * 2 ** attempt);
            continue;
          }
          return {
            data: results,
            forbidden: false,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      }
    }

    return { data: results, forbidden: false };
  }

  /**
   * Returns all active courses the user is enrolled in.
   * include[]=term pulls in the enrollment term so we can extract the academic year.
   *
   * NOTE: enrollment_type=student is intentionally omitted — the parameter is
   * deprecated and some Canvas instances (including UoG) reject it with a 400.
   *
   * @returns {Promise<{ data: any[], forbidden: boolean, error?: string }>}
   */
  async getCourses() {
    return this.#getPaginated(
      "/courses?enrollment_state=active&include[]=term",
    );
  }

  /**
   * Returns full metadata for a single course.
   *
   * @param {string} courseId
   * @returns {Promise<{ data: any|null, forbidden: boolean, error?: string }>}
   */
  async getCourse(courseId) {
    return this.#get(`/courses/${courseId}`);
  }

  /**
   * Returns all assignments for a course.
   * include[]=submission pulls in the student's own submission attachments.
   *
   * @param {string} courseId
   * @returns {Promise<{ data: any[], forbidden: boolean, error?: string }>}
   */
  async getAssignments(courseId) {
    return this.#getPaginated(
      `/courses/${courseId}/assignments?include[]=submission`,
    );
  }

  /**
   * Returns all modules inside a course.
   * Modules are the folder-like containers Canvas uses to organise content.
   *
   * @param {string} courseId
   * @returns {Promise<{ data: any[], forbidden: boolean, error?: string }>}
   */
  async getModules(courseId) {
    return this.#getPaginated(`/courses/${courseId}/modules`);
  }

  /**
   * Returns all items inside a specific module.
   * Items can be Files, Pages, Assignments, Quizzes, etc.
   * The import pipeline filters these down to File type only.
   *
   * @param {string} courseId
   * @param {string} moduleId
   * @returns {Promise<{ data: any[], forbidden: boolean, error?: string }>}
   */
  async getModuleItems(courseId, moduleId) {
    return this.#getPaginated(`/courses/${courseId}/modules/${moduleId}/items`);
  }

  /**
   * Returns full metadata for a single file, including its download URL and MIME type. Called once per file item found in a module.
   *
   * @param {string} courseId
   * @param {string} fileId
   * @returns {Promise<{ data: any|null, forbidden: boolean, error?: string }>}
   */
  async getFile(courseId, fileId) {
    return this.#get(`/courses/${courseId}/files/${fileId}`);
  }

  /**
   * Downloads a file's binary content from Canvas.
   * The URL comes from the file metadata returned by getFile().
   * Returns a Node.js Buffer ready to pass to S3.
   *
   * @param {string} url - Direct download URL from Canvas file metadata
   * @returns {Promise<{ buffer: Buffer|null, forbidden: boolean, error?: string }>}
   */
  async downloadFile(url) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        if (response.status === 403) {
          return {
            buffer: null,
            forbidden: true,
            error: "File download restricted",
          };
        }

        if (response.status === 429) {
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_BASE_MS * 2 ** attempt);
            continue;
          }
          return {
            buffer: null,
            forbidden: false,
            error: "Download rate limited",
          };
        }

        if (!response.ok) {
          return {
            buffer: null,
            forbidden: false,
            error: `Download failed: ${response.status}`,
          };
        }

        const arrayBuffer = await response.arrayBuffer();
        return { buffer: Buffer.from(arrayBuffer), forbidden: false };
      } catch (err) {
        if (attempt < MAX_RETRIES && isRetryable(err)) {
          await sleep(RETRY_BASE_MS * 2 ** attempt);
          continue;
        }
        return {
          buffer: null,
          forbidden: false,
          error: err instanceof Error ? err.message : "Download error",
        };
      }
    }
  }
}
