# Contributing

> Status: Active contributor guide
>
> Audience: Maintainers adding, changing, or removing Canvas MCP tools
>
> Last verified: 2026-07-11

The package is intentionally small, but its impact is not: all 129 tool objects
are registered, including mutating and elevated-permission operations. Treat
tool changes as API and security changes.

## Ground Rules

- Name tools `canvas_<verb>_<noun>` in snake case.
- Keep one source file per Canvas domain under `src/tools/`.
- Mirror each domain with tests under `tests/tools/`.
- Update `TOOL_MANIFEST.md` in the same change.
- Update `ATTRIBUTION.md` when new external code or design materially informs
  the implementation.
- Never add a live token, authenticated URL, response fixture with private
  Canvas data, or institution-specific secret.
- Do not describe a tool as disabled unless it is absent from the exported
  arrays and verified absent from `tools/list`.

## Before Adding a Tool

1. Check the manifest and source for an equivalent endpoint.
2. Classify the operation:
   - read-only;
   - self-state mutation;
   - content creation/update;
   - destructive;
   - educator/admin.
3. Read the current official Canvas API documentation.
4. Decide whether the operation can be safe as one bounded call.
5. For uploads or multi-step browser/client flows, prefer an explicit stub or
   omit the tool rather than pretending the operation is complete.
6. Record any external implementation influence and license uncertainty.

Do not add a duplicate merely because another reference project uses a
different name.

## Implement a Tool

Add a `ToolDef` object to the relevant exported domain array:

```ts
{
    name: "canvas_list_external_tools",
    description:
        "List external tools available in a course. Requires course access.",
    inputSchema: z.object({
        course_id: z.number().int().positive(),
        search_term: z.string().optional(),
    }),
    handler: async (args, { canvas }) => {
        const tools = await canvas.collectPaginated(
            `/api/v1/courses/${args.course_id}/external_tools`,
            {
                per_page: 100,
                ...(args.search_term
                    ? { search_term: args.search_term }
                    : {}),
            },
        );
        return jsonResult(tools);
    },
},
```

Use:

- `canvas.collectPaginated` for paginated lists;
- `canvas.get` for a single read;
- `canvas.post`, `canvas.put`, and `canvas.delete` only when the operation is
  intentionally mutating;
- `jsonResult` for JSON output;
- `textResult` only when text output is deliberate.

Descriptions must state important permission and mutation behavior. They are
shown directly to connected models.

## `exactOptionalPropertyTypes`

The package enables `exactOptionalPropertyTypes`. Do not pass
`string | undefined` as an explicitly present property:

```ts
// Incorrect
const body = {
    name: args.name,
    description: args.description,
};

// Correct
const body = {
    name: args.name,
    ...(args.description !== undefined
        ? { description: args.description }
        : {}),
};
```

Use `!== undefined` for optional numbers and booleans so valid falsy values are
not dropped.

## Add Tests

Every tool needs a unit test that:

- finds the registered tool by exact name;
- validates representative input;
- asserts the HTTP method and Canvas path;
- asserts relevant query/body serialization;
- checks the returned MCP content;
- covers permission/error mapping when behavior is special;
- verifies stub behavior without making a mutation.

For a mutating tool, mock the client. Do not prove correctness by changing a
real course.

Also test edge cases that could widen impact, such as empty bulk arrays,
unbounded recipient lists, unexpected IDs, or ignored destination paths.

## Update the Manifest

Add or update exactly one row for the registered name:

- include the actual Canvas endpoint or label a composite/stub honestly;
- list the Zod input fields, not every upstream API option;
- place self-state mutations and elevated operations where their risk is
  visible;
- name external source projects only when they materially informed the tool.

After editing, compare the unique manifest names with the names in
`src/tools/*.ts`. The sets and count should match.

`TOOL_MANIFEST.md` is the human inventory. Runtime schemas and handlers remain
the behavioral authority.

## Verify Locally

Run from this directory:

```bash
npm test
npm run typecheck
npm run build
```

Then inspect the built server's `tools/list` when tool registration changed.
Transport changes also require an integration test that sends at least two
sequential MCP requests and proves each request receives a fresh stateless
transport lifecycle.

## Live Smoke Verification

After `npm run build`, `scripts/verify-tools.mjs` runs a representative,
read-focused smoke pass against a real Canvas account. It does not enumerate or
validate all registered tools.

The current script prints response previews and may include a pre-authenticated
download URL. Do not run it against a real Canvas account until URL and
credential redaction is implemented and verified.

After that safety gap is fixed, any live check must:

- use a dedicated least-privileged test account;
- review the script before running it;
- use an ignored environment for credentials;
- never use production instructor/admin tokens;
- keep verifier output private and redact authenticated capabilities;
- do not expand the smoke pass to mutations without explicit approval and
  disposable test data.

Unit tests and official Canvas API review remain required even when the smoke
pass succeeds.

## Removing or Narrowing Tools

There is no runtime feature flag or allowlist. To narrow a build:

1. remove the tool object from the domain array;
2. remove or update its tests;
3. remove its manifest row;
4. rebuild;
5. verify it is absent from `tools/list`.

Do not only change a comment or table heading; comments do not affect
registration.

## Security Review for Mutations

Before merging a new state-changing tool, answer:

- What user-visible or institution-visible state changes?
- Can the operation affect other users?
- What token role is required?
- Is the input bounded?
- Is a retry idempotent?
- Can the user undo it?
- What confirmation should the upstream agent require?
- What audit evidence exists without logging private content?
- Should this tool be absent from the default build instead?

Canvas permissions are necessary but not sufficient. Deployment authentication,
tool authorization, confirmation, and audit controls sit outside the current
server and must be documented by the operator.
