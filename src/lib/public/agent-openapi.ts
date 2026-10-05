// the public OpenAPI description served at /openapi.json and /agent-api.json
import { getBaseUrl } from "./agent-content";

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
]);

const SENSITIVE_OPERATIONS = new Set([
  "post /api/auth/register",
  "post /agent/identity",
  "post /api/notes",
  "patch /api/notes/{id}",
  "delete /api/notes/{id}",
  "post /api/chat",
  "post /api/canvas/connect",
  "delete /api/canvas/connect",
  "post /api/canvas/sync",
  "post /api/assignments",
  "post /api/calendar/token",
]);

const PRIVATE_DATA_OPERATIONS = new Set([
  "get /api/notes",
  "post /api/notes",
  "get /api/notes/{id}",
  "patch /api/notes/{id}",
  "delete /api/notes/{id}",
  "get /api/search",
  "get /api/global-search",
  "post /api/chat",
  "get /api/tree/children",
  "get /api/canvas/connect",
  "post /api/canvas/connect",
  "delete /api/canvas/connect",
  "get /api/canvas/sync",
  "post /api/canvas/sync",
  "get /api/canvas/status",
  "get /api/assignments",
  "post /api/assignments",
  "get /api/calendar/token",
  "post /api/calendar/token",
  "post /api/mcp/canvas",
]);

const TAG_BY_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ["/agent/identity", "Auth"],
  ["/api/auth", "Auth"],
  ["/api/notes", "Notes"],
  ["/api/search", "Search"],
  ["/api/global-search", "Search"],
  ["/api/chat", "Chat"],
  ["/api/tree", "Notes"],
  ["/api/canvas", "Canvas"],
  ["/api/assignments", "Assignments"],
  ["/api/calendar", "Calendar"],
  ["/api/mcp", "MCP"],
  ["/contact", "Contact"],
];

interface OpenApiOperation {
  operationId?: string;
  tags?: string[];
  security?: Array<Record<string, unknown[]>>;
  [key: string]: unknown;
}

interface AgentOpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  tags?: Array<{ name: string; description: string }>;
  components?: Record<string, unknown>;
  [key: string]: unknown;
}

function wordsFromPath(path: string): string[] {
  return path
    .replace(/[{}]/g, "")
    .split(/[/.:-]+/)
    .filter(Boolean)
    .filter((part) => part !== "api")
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""));
}

function toOperationId(method: string, path: string): string {
  const parts = wordsFromPath(path);
  return [
    method,
    ...parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)),
  ].join("");
}

function inferTags(path: string): string[] {
  const match = TAG_BY_PREFIX.find(([prefix]) => path.startsWith(prefix));
  return [match?.[1] ?? "Discovery"];
}

function isSessionOperation(path: string): boolean {
  return (
    path.startsWith("/api/") &&
    !path.startsWith("/api/auth/") &&
    path !== "/api/mcp/canvas"
  );
}

function decorateAgentOpenApiDocument(
  document: AgentOpenApiDocument,
): AgentOpenApiDocument {
  document.tags = [
    {
      name: "Discovery",
      description: "Public discovery and AI-readable resources.",
    },
    {
      name: "Auth",
      description: "Account creation and browser-session authentication.",
    },
    { name: "Notes", description: "Authenticated note and tree operations." },
    {
      name: "Search",
      description: "Authenticated keyword, semantic, and global search.",
    },
    {
      name: "Chat",
      description: "Authenticated cited study chat over private material.",
    },
    {
      name: "Canvas",
      description:
        "Authenticated Canvas connection, sync, and import status.",
    },
    {
      name: "Assignments",
      description: "Authenticated coursework and manual assignment operations.",
    },
    {
      name: "Calendar",
      description:
        "Authenticated private iCal subscription token operations.",
    },
    { name: "MCP", description: "Internal MCP bridge endpoints." },
    { name: "Contact", description: "Public contact routes." },
  ];
  document.components = {
    ...document.components,
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "session",
        description:
          "Authenticated browser session cookie. Auth.js session cookies may also be accepted by the app.",
      },
      internalMcpBearer: {
        type: "http",
        scheme: "bearer",
        description:
          "Internal bearer token minted by OghmaNotes for the Canvas MCP bridge.",
      },
    },
  };

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;

      const key = `${method} ${path}`;
      operation.operationId ??= toOperationId(method, path);
      operation.tags ??= inferTags(path);
      operation["x-agent-guidance"] ??=
        "Prefer the browser-visible UI for credentials. Ask for explicit human confirmation before sensitive writes or private-data actions.";

      if (isSessionOperation(path)) {
        operation.security ??= [{ sessionCookie: [] }];
      }
      if (path === "/api/mcp/canvas") {
        operation.security ??= [{ internalMcpBearer: [] }];
        operation["x-internal-only"] = true;
      }
      if (SENSITIVE_OPERATIONS.has(key)) {
        operation["x-human-confirmation-required"] = true;
      }
      if (PRIVATE_DATA_OPERATIONS.has(key)) {
        operation["x-private-data"] = true;
      }
    }
  }

  return document;
}

export function buildAgentOpenApiJson(
  baseUrl = getBaseUrl(),
): AgentOpenApiDocument {
  const noteUpdateOperation = () => ({
    summary: "Update one note",
    description:
      "Requires a signed-in session. Updating content can refresh the note's search index.",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              title: { type: "string", maxLength: 500 },
              content: { type: "string" },
            },
          },
        },
      },
    },
    responses: {
      "200": { description: "Updated note object" },
      "400": { description: "Validation failed" },
      "401": { description: "Unauthorized" },
      "404": { description: "Note not found" },
    },
  });

  const document = {
    openapi: "3.1.0",
    info: {
      title: "OghmaNotes Agent Action Guide",
      version: "2026-07-20",
      summary:
        "Structured public and authenticated action contracts for agents helping humans use OghmaNotes.",
      description:
        "Agents must obtain explicit human confirmation before registering accounts, submitting contact forms, sending messages, importing data, or querying authenticated study material.",
      contact: {
        email: "contact@oghmanotes.ie",
        url: `${baseUrl}/contact`,
      },
    },
    servers: [{ url: baseUrl }],
    externalDocs: {
      description: "Canonical Markdown agent profile",
      url: `${baseUrl}/ai.md`,
    },
    paths: {
      "/info": {
        get: {
          summary: "Compact human and agent-readable product profile",
          description:
            "Returns HTML by default. Returns compact Markdown when Accept includes text/markdown or when format=md is supplied.",
          parameters: [
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["md", "markdown"] },
            },
          ],
          responses: {
            "200": {
              description: "Compact profile as HTML or Markdown",
              content: {
                "text/html": { schema: { type: "string" } },
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/info.md": {
        get: {
          summary: "Compact Markdown product and agent factsheet",
          responses: {
            "200": {
              description: "Compact Markdown profile",
              content: {
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/ai": {
        get: {
          summary: "Human and agent-readable AI profile",
          description:
            "Returns HTML by default. Returns Markdown when Accept includes text/markdown or when format=md is supplied.",
          parameters: [
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["md", "markdown"] },
            },
          ],
          responses: {
            "200": {
              description: "AI profile as HTML or Markdown",
              content: {
                "text/html": { schema: { type: "string" } },
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/ai.md": {
        get: {
          summary: "Canonical Markdown AI and agent profile",
          responses: {
            "200": {
              description: "Markdown profile",
              content: {
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/llms.txt": {
        get: {
          summary: "Compact LLM index",
          responses: {
            "200": {
              description: "Compact plain-text profile",
              content: {
                "text/plain": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/llms-full.txt": {
        get: {
          summary: "Full plain-text agent profile",
          responses: {
            "200": {
              description: "Full plain-text profile",
              content: {
                "text/plain": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/agents.md": {
        get: {
          summary: "Full Markdown agent action guide",
          responses: {
            "200": {
              description: "Full Markdown profile with action guidance",
              content: {
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/faq.md": {
        get: {
          summary: "FAQ-only Markdown",
          responses: {
            "200": {
              description: "Markdown FAQ",
              content: {
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/pricing.md": {
        get: {
          summary: "Pricing-only Markdown",
          responses: {
            "200": {
              description: "Markdown pricing summary",
              content: {
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/auth.md": {
        get: {
          summary: "auth.md new-user registration instructions",
          description:
            "Agent registration instructions. This v1 flow never issues an API credential or private-data access.",
          responses: {
            "200": {
              description: "auth.md instructions",
              content: { "text/markdown": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/agent/identity": {
        post: {
          summary: "Start an agent-initiated new-user registration",
          description:
            "Creates a 15-minute claim for an email that does not already have an OghmaNotes account. The user must complete password creation and email verification in the browser. No access token is issued.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type", "login_hint"],
                  properties: {
                    type: { type: "string", enum: ["service_auth"] },
                    login_hint: { type: "string", format: "email", maxLength: 255 },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Claim URI and user code returned" },
            "400": { description: "Invalid registration request" },
            "409": { description: "Existing account or pending claim" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/agent/identity/claim": {
        post: {
          summary: "Poll an agent registration claim",
          description:
            "Reports pending, registered, or verified status. It never returns an API credential.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["claim_token"],
                  properties: { claim_token: { type: "string", minLength: 64, maxLength: 64 } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Current claim status" },
            "400": { description: "Invalid or expired claim" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/agent/identity/claim/complete": {
        post: {
          summary: "Complete an agent registration claim with OAuth",
          description:
            "Requires an Auth.js browser session whose provider-verified email matches the new-user claim. It never returns an API credential.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["claim_token", "user_code"],
                  properties: {
                    claim_token: { type: "string", minLength: 64, maxLength: 64 },
                    user_code: { type: "string", pattern: "^[0-9]{6}$" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Registration verified" },
            "400": { description: "Mismatched or expired claim" },
            "401": { description: "OAuth browser session required" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/agent-sitemap.xml": {
        get: {
          summary: "Sitemap for machine-readable resources",
          responses: {
            "200": {
              description: "XML sitemap for agent and LLM resources",
              content: {
                "application/xml": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/agent-api.json": {
        get: {
          summary: "Structured agent API document",
          description:
            "OpenAPI-style endpoint guide for agents helping users navigate and operate OghmaNotes.",
          responses: {
            "200": {
              description: "Structured API document",
              content: {
                "application/json": { schema: { type: "object" } },
              },
            },
          },
        },
      },
      "/openapi.json": {
        get: {
          summary: "Standard OpenAPI alias",
          description:
            "Same structured endpoint guide as /agent-api.json, exposed under a conventional OpenAPI URL.",
          responses: {
            "200": {
              description: "Structured API document",
              content: {
                "application/json": { schema: { type: "object" } },
              },
            },
          },
        },
      },
      "/api/auth/register": {
        post: {
          summary: "Create a user account",
          description:
            "Creates an account and requires email verification. Agents should prefer the browser-visible registration flow and must not store user passwords.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email", maxLength: 255 },
                    password: {
                      type: "string",
                      minLength: 8,
                      maxLength: 128,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Account created; email verification required",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      requiresVerification: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": { description: "Validation failed" },
            "409": { description: "User already exists" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/api/auth/login": {
        post: {
          summary: "Create an authenticated session",
          description:
            "Signs in a verified user and sets session cookies. Agents should use a user-controlled browser session rather than requesting credentials in chat.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email", maxLength: 255 },
                    password: { type: "string", maxLength: 128 },
                    rememberMe: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Authenticated session created" },
            "401": { description: "Invalid email or password" },
            "403": {
              description: "Email verification required or inactive account",
            },
            "429": { description: "Rate limited or account temporarily locked" },
          },
        },
      },
      "/api/chat": {
        post: {
          summary: "Ask an authenticated study question",
          description:
            "Requires an authenticated session cookie. Agents must get confirmation before sending private study material or questions on behalf of a user.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  additionalProperties: false,
                  properties: {
                    message: { type: "string", minLength: 1, maxLength: 2000 },
                    stream: { type: "boolean", default: false },
                    useRag: { type: "boolean", default: true },
                    noteId: { type: "string" },
                    noteTitle: { type: "string" },
                    noteIds: { type: "array", items: { type: "string" } },
                    folderIds: { type: "array", items: { type: "string" } },
                    selectedNotes: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["id", "title"],
                        additionalProperties: false,
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" },
                        },
                      },
                    },
                    selectedFolders: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["id", "title"],
                        additionalProperties: false,
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" },
                        },
                      },
                    },
                    sessionId: { type: ["string", "null"] },
                    history: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["role", "content"],
                        additionalProperties: false,
                        properties: {
                          role: {
                            type: "string",
                            enum: ["user", "assistant", "system"],
                          },
                          content: { type: "string" },
                        },
                      },
                    },
                    background: { type: "boolean", default: false },
                    thinkingMode: {
                      type: "string",
                      enum: ["off", "auto"],
                    },
                    clientDateTime: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Chat answer as JSON or server-sent events when stream=true",
            },
            "202": { description: "Background generation accepted when stream=true and background=true" },
            "400": { description: "Invalid JSON object or invalid chat request" },
            "401": { description: "Unauthorized" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/api/notes": {
        get: {
          summary: "List authenticated user's notes",
          description:
            "Requires a signed-in session. Supports optional field selection and pagination.",
          parameters: [
            {
              name: "fields",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Comma-separated response fields.",
            },
            {
              name: "skip",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 0 },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 200 },
            },
            {
              name: "q",
              in: "query",
              required: false,
              schema: { type: "string", maxLength: 200 },
              description: "Optional title search query.",
            },
          ],
          responses: {
            "200": { description: "Array of notes and folders" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create a note or folder",
          description:
            "Requires a signed-in session. Agents should ask before creating content for a user.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      format: "uuid",
                      description: "Optional caller-supplied note ID.",
                    },
                    title: { type: "string", maxLength: 500 },
                    content: { type: "string" },
                    isFolder: { type: "boolean" },
                    is_folder: { type: "boolean" },
                    pid: {
                      type: ["string", "null"],
                      format: "uuid",
                      description: "Optional parent folder note ID.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Created note or folder" },
            "400": { description: "Validation failed" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/notes/{id}": {
        get: {
          summary: "Read one note",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "fields",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Note object" },
            "400": { description: "Invalid note ID" },
            "401": { description: "Unauthorized" },
            "404": { description: "Note not found" },
          },
        },
        put: noteUpdateOperation(),
        patch: noteUpdateOperation(),
        delete: {
          summary: "Soft-delete one note",
          description:
            "Requires a signed-in session and explicit human confirmation.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": { description: "Deleted: { success: true }" },
            "400": { description: "Invalid note ID" },
            "401": { description: "Unauthorized" },
            "404": { description: "Note not found" },
          },
        },
      },
      "/api/search": {
        get: {
          summary: "Search notes",
          description:
            "Requires a signed-in session. Searches notes by keyword or semantic mode.",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 2 },
            },
            {
              name: "mode",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["keyword", "semantic"] },
            },
            {
              name: "course",
              in: "query",
              required: false,
              schema: {
                type: "string",
                pattern: "^(?:0|[1-9][0-9]{0,18})$",
                maxLength: 19,
              },
              description:
                "Canvas course ID as a signed-64-bit-compatible decimal string.",
            },
            {
              name: "exclude",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Comma-separated note IDs to exclude in semantic mode.",
            },
          ],
          responses: {
            "200": { description: "Search results" },
            "400": { description: "Invalid mode or Canvas course ID" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/global-search": {
        get: {
          summary: "Search notes, chats, and quiz courses",
          description:
            "Requires a signed-in session. Empty or short queries return recent items.",
          parameters: [
            {
              name: "q",
              in: "query",
              required: false,
              schema: { type: "string", maxLength: 200 },
            },
          ],
          responses: {
            "200": {
              description: "Grouped results under notes, chats, and quizzes",
            },
            "401": { description: "Unauthorized" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/api/tree/children": {
        get: {
          summary: "List note tree children",
          description:
            "Requires a signed-in session. Use no parent_id for root children.",
          parameters: [
            {
              name: "parent_id",
              in: "query",
              required: false,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": { description: "Folder children" },
            "400": { description: "Invalid parent_id" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/canvas/connect": {
        get: {
          summary: "Read Canvas connection state and visible courses",
          description:
            "Requires a signed-in session. Responses are no-store because they reflect private Canvas state.",
          responses: {
            "200": { description: "Canvas connection state" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Connect Canvas",
          description:
            "Requires a signed-in session. Agents must not ask users to paste Canvas tokens into chat; prefer the browser-visible settings flow.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["domain", "token"],
                  properties: {
                    domain: {
                      type: "string",
                      pattern: "^[\\w-]+\\.instructure\\.com$",
                    },
                    token: { type: "string", maxLength: 4096 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Canvas connected" },
            "400": { description: "Invalid token or domain" },
            "401": { description: "Unauthorized" },
            "429": { description: "Rate limited" },
          },
        },
        delete: {
          summary: "Disconnect Canvas",
          description:
            "Requires a signed-in session and explicit human confirmation.",
          responses: {
            "200": { description: "Canvas disconnected" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/canvas/sync": {
        get: {
          summary: "Check Canvas sync availability",
          responses: {
            "200": { description: "Sync availability and active job state" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Queue a Canvas sync job",
          description:
            "Requires a signed-in session and explicit human confirmation because it imports private course material.",
          responses: {
            "200": { description: "Queued job or reason sync was unavailable" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/canvas/status": {
        get: {
          summary: "Read Canvas import progress",
          responses: {
            "200": { description: "Active job, progress, issues, and recent logs" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/assignments": {
        get: {
          summary: "List assignments",
          description:
            "Requires a signed-in session. Supports status, course, archive, and time-window filters.",
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "course",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "all",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["1"] },
            },
            {
              name: "includeArchived",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["1"] },
            },
            {
              name: "windowDays",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 730 },
            },
          ],
          responses: {
            "200": { description: "Assignments" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create a manual assignment",
          description:
            "Requires a signed-in session and explicit human confirmation.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  additionalProperties: false,
                  properties: {
                    title: { type: "string", minLength: 1, maxLength: 500 },
                    description: {
                      type: ["string", "null"],
                      maxLength: 10000,
                    },
                    course_name: {
                      type: ["string", "null"],
                      maxLength: 500,
                    },
                    course_color: {
                      type: ["string", "null"],
                      maxLength: 500,
                    },
                    due_at: {
                      type: ["string", "null"],
                      format: "date-time",
                    },
                    estimated_hours: {
                      type: ["number", "null"],
                      minimum: 0,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Created assignment" },
            "400": { description: "Validation failed" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/calendar/token": {
        get: {
          summary: "Read private iCal subscription token",
          description:
            "Requires a signed-in session. Treat this token as private because it grants calendar feed access.",
          responses: {
            "200": { description: "Current calendar export token" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Rotate private iCal subscription token",
          description:
            "Requires a signed-in session and explicit human confirmation because old calendar URLs stop working.",
          responses: {
            "200": { description: "New calendar export token" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/mcp/canvas": {
        post: {
          summary: "Internal Canvas MCP bridge",
          description:
            "Internal streamable HTTP MCP endpoint for Canvas tools. Requires an internal bearer token minted by OghmaNotes; it is not a public end-user MCP endpoint.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
          responses: {
            "200": { description: "MCP JSON response" },
            "401": { description: "Missing or invalid internal MCP token" },
            "403": { description: "Canvas account not connected" },
            "500": { description: "Canvas MCP request failed" },
          },
        },
      },
      "/contact": {
        get: {
          summary: "Contact form for beta, support, billing, and pilots",
          description:
            "There is no first-party public contact POST API documented for agents. Agents should use the visible form with confirmation or draft an email to contact@oghmanotes.ie.",
          responses: {
            "200": {
              description: "Contact page",
              content: {
                "text/html": { schema: { type: "string" } },
              },
            },
          },
        },
      },
    },
  };

  return decorateAgentOpenApiDocument(document);
}
