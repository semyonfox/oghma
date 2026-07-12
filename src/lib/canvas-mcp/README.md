# canvas-mcp

> Status: Experimental; multi-request transport lifecycle is a deployment blocker
>
> Audience: Maintainers and operators integrating Canvas LMS with MCP clients
>
> Last verified: 2026-07-11 against the registered tool arrays and server entry

`canvas-mcp` is a TypeScript Streamable HTTP MCP server over the Canvas LMS
REST API. It exposes 129 registered tools across 15 domains.

**All 129 tools are registered by default.** The surface includes reads,
self-state updates, creates, grading, messaging, and destructive
educator/admin operations. Canvas permissions limit what a token can do, but
they do not replace caller authentication, least privilege, human
confirmation, or agent policy.

Read [the tool manifest](TOOL_MANIFEST.md) before connecting any model.

## Security Boundary

This server is suitable only for a trusted local environment or behind an
authenticated, authorized proxy that controls who can call it and which Canvas
domains/tokens they may use.

The server itself does **not** provide:

- application-layer caller authentication;
- OAuth or user identity;
- a Canvas-domain allowlist;
- per-tool authorization or feature flags;
- human-confirmation prompts;
- audit logging;
- tenant isolation beyond selecting credentials for one request.

Do not expose the server directly to the public Internet. Do not treat a
student token as proof that an arbitrary caller is the student. Instructor and
admin tokens have a much larger blast radius.

Use a least-privileged Canvas token, narrow the registered tools in code, and
put the service behind a trusted boundary before connecting an agent.

### Transport lifecycle blocker

The current entry point creates one stateless `StreamableHTTPServerTransport`
and reuses it across HTTP requests. The installed MCP SDK's stateless pattern
requires a fresh transport per request. Treat multi-request operation as broken
or at least unverified; do not deploy or connect a real agent until the server
lifecycle is corrected and a test proves two or more sequential MCP requests.

## Tool Surface

The registered domains are:

- courses;
- assignments;
- submissions;
- grades;
- modules;
- pages;
- calendar and planner;
- announcements;
- discussions;
- files and folders;
- conversations/messages;
- notifications/activity;
- profile/settings;
- quizzes;
- rubrics.

The manifest separates primarily read-oriented tools from mutating or
elevated-permission tools for review. That grouping is descriptive only:
both groups are live in `tools/list`.

Notable limitations:

- `canvas_upload_file` is an explicit stub because Canvas upload is a
  multi-step multipart handshake.
- upload/media paths of `canvas_submit_assignment` are not a complete file
  transfer implementation; text and URL paths are the supported direct cases.
- `canvas_download_file_to_disk` returns a pre-authenticated URL and ignores
  the destination path. It does not write to the server filesystem.

Pre-authenticated download URLs are credentials until they expire. Do not log
or expose them unnecessarily.

## Requirements

- Node.js 22 or newer
- npm
- a Canvas user API token and Canvas host for local single-user use, or a
  trusted proxy that supplies them per request

## Local Trusted Use

The native server calls `listen(port)` without a host argument, so it can bind
on every available interface. The HTTP client URL below does **not** restrict
the server to loopback. Prefer the loopback-published Docker example in the
next section; use the native development server only on an isolated host with
firewall rules that prevent untrusted access.

From this directory, for an isolated native run:

```bash
cp .env.example .env
# Fill CANVAS_API_TOKEN and CANVAS_DOMAIN in the ignored .env file.
chmod 600 .env
npm install
npm run build
node --env-file=.env dist/index.js
```

For a production build:

```bash
npm run build
npm start
```

`GET /health` returns `{"ok":true}`. MCP Streamable HTTP traffic is handled at
the root path on port `3001` by default.

Example local client configuration:

```json
{
  "mcpServers": {
    "canvas": {
      "type": "http",
      "url": "http://127.0.0.1:3001"
    }
  }
}
```

Keep the service on a trusted interface/network unless a proper proxy boundary
has been added.

## Environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `CANVAS_API_TOKEN` | No | None | Fallback Canvas token when the request has no `X-Canvas-Token` |
| `CANVAS_DOMAIN` | No | None | Fallback Canvas host, without a scheme |
| `PORT` | No | `3001` | HTTP listen port |
| `LOG_LEVEL` | No | `info` | Parsed log level: `debug`, `info`, `warn`, or `error` |

If neither the request nor environment supplies both token and domain, the
server returns `401` before making a Canvas request.

## Credential Modes

### Environment fallback

Set `CANVAS_API_TOKEN` and `CANVAS_DOMAIN` for a personal or single-user
trusted deployment. Store the token in an ignored env file or deployment
secret, never in the image or repository.

### Per-request headers

Requests may supply:

- `X-Canvas-Token`;
- `X-Canvas-Domain`.

The token is held in memory for the request and the environment acts as a
fallback for a missing header.

This is a credential-passthrough mechanism, **not multi-tenant
authentication**. The server does not authenticate the caller or allowlist the
domain. Use it only when a trusted upstream service has already authenticated
the user, authorized the Canvas account, constrained the destination, and
protected the headers in transit.

## Intended Request Flow

After the transport lifecycle blocker above is fixed:

1. The Node HTTP server handles `/health` or passes the request to the
   Streamable HTTP transport.
2. Token and domain are resolved from headers, then environment fallbacks.
3. A request-scoped `CanvasClient` is placed in `AsyncLocalStorage`.
4. MCP validates tool arguments with the tool's Zod schema.
5. The handler calls Canvas and returns JSON as MCP text content.
6. Canvas failures become MCP error results with status/message context.

The intended design has no response cache, queue, or MCP session state.

## Docker

From this directory:

```bash
docker build -t canvas-mcp .
docker run --rm -p 127.0.0.1:3001:3001 \
  --env-file .env \
  canvas-mcp
```

The image uses a two-stage build, a distroless Node 22 runtime, and a non-root
user. Binding to loopback in the example is intentional.

## Deployment

The target deployment is a long-lived Node process or container behind a
trusted network/proxy boundary. The current transport lifecycle blocker must be
fixed first. The process handles `SIGTERM`/`SIGINT` for graceful shutdown.

The code calls `http.listen()` and does not export a Lambda/function handler.
Stateless MCP transport does not by itself make this package deployable on a
function platform; an explicit adapter and lifecycle tests would be required.

Any remote deployment must add, outside or inside this package:

- TLS;
- caller authentication;
- authorization and domain constraints;
- rate limits and request-size limits;
- structured audit logs with credential redaction;
- explicit confirmation for state-changing tools;
- monitoring and incident response.

## Narrowing Tools

There is no runtime tool allowlist. To create a narrower build:

1. remove unwanted tool objects from `src/tools/<domain>.ts`;
2. update tests and `TOOL_MANIFEST.md`;
3. run the full package verification;
4. rebuild and inspect `tools/list`;
5. review the resulting token permissions and agent policy.

Removing destructive tools in code is preferable to relying only on prompting.

## Verification

Local verification:

```bash
npm test
npm run typecheck
npm run build
```

`scripts/verify-tools.mjs` is a representative, read-focused live smoke script,
not exhaustive verification of all 129 tools. It prints response previews and
currently calls a tool that returns a pre-authenticated file URL. **Do not run
the current script against a real Canvas account until URL and credential
redaction is implemented and verified.** Unit tests, type checking, a build,
and inspection of `tools/list` are the supported verification path for now.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Every tool change must update code,
tests, and the manifest together. Changes to mutating tools also require a
security and confirmation-boundary review.

## Provenance and License

The package was synthesized from multiple open-source Canvas MCP projects.
[ATTRIBUTION.md](ATTRIBUTION.md) records known influences and unresolved
license-label questions. Verify upstream licenses at the relevant revisions
before redistributing derived code.

The local license text is in [LICENSE](LICENSE). The package is not affiliated
with or endorsed by Instructure.

## Disclaimer

Any connected client can call every registered tool. A privileged Canvas token
can allow an agent to alter courses, assignments, grades, messages, files, or
accounts. Canvas may log calls, but that does not make changes reversible.

You are responsible for deployment security, token scope, tool selection,
human confirmation, and the actions of connected clients.
