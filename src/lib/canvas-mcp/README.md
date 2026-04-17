# canvas-mcp

An MCP server for Canvas LMS, written in TypeScript. One server, the whole
Canvas REST surface — built to be useful for students, teachers, academic
staff, and administrators alike. Everything's on by default; trim what
you don't want rather than flip flags to turn things on.

The project started as a union of the twelve existing open-source Canvas
MCP servers — all MIT or ISC licensed — normalised, deduped, and merged
into a single maintainable codebase. `ATTRIBUTION.md` names every repo
the design borrows from; full credit goes to their authors.

## Scope

Canvas has a big API. This server aims to expose the useful parts of it in
a way that makes sense to both a language model and a human. Fifteen
Canvas domains are covered:

courses, assignments, submissions, grades, modules, pages, calendar,
announcements, discussions, files, messages, notifications, profile,
quizzes, rubrics.

129 tools registered out of the box — reads, writes, creates, deletes,
the full surface. Every tool has a unit test against a mocked Canvas
client. `TOOL_MANIFEST.md` lists them all with endpoints, inputs, and the
source repos each one is cribbed from.

Canvas enforces its own permission model on every call, so a student token
will only be able to do student things regardless of what's registered —
the server doesn't try to gate anything it doesn't need to. If you want a
narrower tool surface for a specific deployment (a student agent, say,
that should never see `canvas_delete_course`), delete or comment the tools
you don't want from `src/tools/<domain>.ts` and rebuild. No feature flags,
no env toggle — the fork point is a visible code change.

Two tools are honest stubs because Canvas requires multi-step client-side
flows the server can't transparently wrap: `canvas_upload_file` (three-step
upload handshake) and the `online_upload`/`media_recording` paths of
`canvas_submit_assignment`. Text and URL submissions work end-to-end.
`canvas_download_file_to_disk` returns a pre-authenticated URL rather than
writing to disk — callers can fetch it directly.

## Getting it running

```bash
cp .env.example .env
# fill in CANVAS_API_TOKEN and CANVAS_DOMAIN
npm install
npm run dev     # watch mode
# or
npm run build && npm start
```

Requires Node 22+.

### Environment

All Canvas-related env vars are optional — if unset, the server expects
per-request headers from callers (see the next section).

| Variable | Required | Default | Notes |
|---|---|---|---|
| `CANVAS_API_TOKEN` | no | — | Fallback Canvas user API token. Used when the caller doesn't send `X-Canvas-Token`. Handy for personal/dev use. |
| `CANVAS_DOMAIN` | no | — | Fallback Canvas host (no scheme). Used when the caller doesn't send `X-Canvas-Domain`. |
| `PORT` | no | `3001` | HTTP port. |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, `error`. |

### Per-request credentials

The server can operate in two modes, picked per-request:

- **Shared single-tenant.** Set `CANVAS_API_TOKEN` and `CANVAS_DOMAIN` in the
  environment. Clients send plain MCP calls; the server uses the env
  credentials for everything. Simple, good for personal use.
- **Multi-tenant passthrough.** Leave the env unset. Each MCP call must
  carry `X-Canvas-Token` and `X-Canvas-Domain` headers, which the server
  uses to build a per-request Canvas client. The token is never stored —
  it's only held in memory for the duration of the request. Ideal when
  upstream callers (e.g. an app backend) already hold per-user Canvas
  credentials and want to forward them.

The two modes mix cleanly: env acts as a fallback when a header is absent.
Requests with no token available (neither header nor env) get a `401` with
an explanatory JSON body and no Canvas call is made.

## Transport

Streamable-http — the current MCP transport standard. Same code path for
local dev and anything you deploy it behind. `GET /health` returns
`{"ok": true}` for load-balancer probes; MCP traffic is on the same port
at the root path, per the streamable-http spec.

Example client config:

```json
{
  "mcpServers": {
    "canvas": {
      "type": "http",
      "url": "http://localhost:3001"
    }
  }
}
```

## Docker

```bash
docker build -t canvas-mcp .
docker run --rm -p 3001:3001 \
  -e CANVAS_API_TOKEN=... \
  -e CANVAS_DOMAIN=... \
  canvas-mcp
```

Two-stage build, distroless runtime, runs as non-root. The image has no
shell.

## Deployment

Nothing about the server assumes any particular host. It's a node process
listening on a port. Run it wherever you run containers or long-lived
processes.

The transport runs in stateless mode — each MCP call is self-contained,
no session state held between requests — so Lambda-style serverless hosts
work as well as long-lived containers. Graceful shutdown on `SIGTERM` is
handled, so rolling deploys on Fargate/Cloud Run/Fly won't drop in-flight
requests.

Rough fit:

- **Lambda + function URL** — cheapest for low-to-medium traffic, free tier
  covers most small apps. Cold start ~300-500ms on a fresh container.
- **Cloud Run** — scales to zero like Lambda, no cold-start penalty if min
  instances ≥ 1. Generous free tier.
- **Fargate / ECS** — always warm, pay-per-hour. Worth it once traffic is
  steady enough that cold-start latency becomes annoying.

If you set env-level fallback credentials (`CANVAS_API_TOKEN` /
`CANVAS_DOMAIN`), source them from a proper secret store rather than
baking them into the image.

## How it works

The server is a thin wrapper around the Canvas REST API. End-to-end, a
single tool call goes like this:

1. **HTTP request hits the server.** `GET /health` short-circuits to a
   200; everything else is MCP traffic over streamable-http.
2. **Credentials are resolved.** The server reads `X-Canvas-Token` and
   `X-Canvas-Domain` from the request headers, falling back to
   `CANVAS_API_TOKEN` / `CANVAS_DOMAIN` env vars if unset. Missing
   credentials → `401`, no further work.
3. **A per-request `CanvasClient` is built** with those credentials and
   scoped to the request via `AsyncLocalStorage`. Tool handlers read it
   through the `ToolContext` they're given — they never touch headers
   directly.
4. **MCP dispatches** the `tools/call` to the matching tool handler in
   `src/tools/<domain>.ts`. The handler's zod schema validates inputs,
   then it uses `canvas.get` / `canvas.post` / etc. to hit the real
   Canvas endpoint.
5. **Canvas's JSON response is stringified** and returned as MCP text
   content. Canvas errors become MCP error responses with the status
   and original message preserved.

No caching, no queuing, no state kept between calls. If you want to add
a tool, you're adding one file entry plus one test — see `CONTRIBUTING.md`.

## Trimming the tool surface

To narrow the set of tools exposed to a particular client, open the
relevant `src/tools/<domain>.ts` file and delete or comment out the tool
objects you don't want. Each tool is a standalone object in the domain's
array — no cross-tool coupling, no shared state, no feature flag — so
removing one is a local change. Rebuild and that tool is gone from the
`tools/list` response.

## Testing

Unit tests run against a mocked fetch:

```bash
npm test
npm run typecheck
```

For live-fire verification against a real Canvas instance,
`scripts/verify-tools.mjs` walks every active tool, discovering IDs as it
goes and logging every call:

```bash
CANVAS_API_TOKEN=... CANVAS_DOMAIN=... node scripts/verify-tools.mjs
```

It skips the three side-effect tools by default
(`mark_module_item_read`, `mark_module_item_done`,
`mark_conversation_read`); edit the `SIDE_EFFECT` set in the script if
you want to exercise them too.

## Contributing

PRs welcome. See `CONTRIBUTING.md` for the full guide — including a
copy-paste recipe for adding a new tool, test patterns, and the
`exactOptionalPropertyTypes` gotcha that trips most first-time
contributors.

## Things deliberately left out for now

- Per-user OAuth / multi-tenant auth (single token per deployment).
- Response caching.
- MCP prompts and resources (only tools are exposed).
- stdio transport — streamable-http handles local and remote use.

All of the above are reasonable future additions; none are blocking for
the current use cases.

## Disclaimer

This server exposes Canvas LMS to a language model. Any MCP client connected
to it can call any of the 129 registered tools, and most of those tools can
create, modify, or delete real data in a real Canvas account. The AI on the
other end will do whatever its prompting steers it to do; there is no
confirmation step between "model decides to call a tool" and "the call
happens." Canvas logs every API call but does not undo them.

If you hand this server an instructor token, an AI assistant can post
announcements, grade submissions, and delete assignments on your behalf. If
you hand it an admin token, the blast radius is the entire institution
account the token can reach. Scope the token down to the least privilege
that does the job, trim tools you don't need before building, and don't
point an open-ended chat agent at a privileged token without understanding
the consequences.

This is provided as-is under the MIT licence. It's not affiliated with or
endorsed by Instructure. I make no warranty that it's safe, correct, or fit
for any purpose, and accept no liability for anything that happens when you
or an AI running through this server interact with Canvas. You are
responsible for how you deploy it, what token you give it, and what any
connected model does with that access.

## License

MIT. See `LICENSE`.
