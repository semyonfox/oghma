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

export class CanvasClient {
  /**
   * @param {string} domain - Canvas institution domain e.g. 'dcu.instructure.com'
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
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
        },
      });

      if (response.status === 403) {
        return { data: null, forbidden: true, error: 'Access restricted by lecturer' };
      }

      if (response.status === 401) {
        return { data: null, forbidden: false, error: 'Invalid or expired Canvas token' };
      }

      if (!response.ok) {
        return { data: null, forbidden: false, error: `Canvas API error: ${response.status}` };
      }

      const data = await response.json();
      return { data, forbidden: false };

    } catch (err) {
      return { data: null, forbidden: false, error: err instanceof Error ? err.message : 'Unknown error' };
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
    let url = `${this.baseUrl}${path}${path.includes('?') ? '&' : '?'}per_page=100`;

    while (url) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
          },
        });

        if (response.status === 403) {
          return { data: results, forbidden: true, error: 'Access restricted by lecturer' };
        }

        if (response.status === 401) {
          return { data: results, forbidden: false, error: 'Invalid or expired Canvas token' };
        }

        if (!response.ok) {
          return { data: results, forbidden: false, error: `Canvas API error: ${response.status}` };
        }

        const page = await response.json();
        results.push(...page);

        // Canvas puts the next page URL in the Link header: <url>; rel="next"
        const linkHeader = response.headers.get('Link');
        const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;

      } catch (err) {
        return { data: results, forbidden: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }

    return { data: results, forbidden: false };
  }

  /**
   * Returns all active courses the user is enrolled in as a student.
   * enrollment_type=student excludes any teacher/observer ghost enrolments.
   *
   * @returns {Promise<{ data: any[], forbidden: boolean, error?: string }>}
   */
  async getCourses() {
    return this.#getPaginated('/courses?enrollment_state=active&enrollment_type=student');
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
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (response.status === 403) {
        return { buffer: null, forbidden: true, error: 'File download restricted' };
      }

      if (!response.ok) {
        return { buffer: null, forbidden: false, error: `Download failed: ${response.status}` };
      }

      const arrayBuffer = await response.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), forbidden: false };

    } catch (err) {
      return { buffer: null, forbidden: false, error: err instanceof Error ? err.message : 'Download error' };
    }
  }
}
