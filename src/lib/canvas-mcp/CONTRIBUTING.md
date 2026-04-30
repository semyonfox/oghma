# Contributing

Thanks for looking. The codebase is deliberately small and standard so
that adding or changing a tool is a short, predictable task. This guide
covers the full workflow for the most common change — adding a new tool
— plus the one TypeScript quirk that catches everyone the first time.

## Ground rules

- Tool names: `canvas_<verb>_<noun>` in snake_case. `canvas_list_courses`,
  `canvas_get_assignment`, `canvas_delete_rubric`. Keeps the surface
  predictable when a client lists available tools.
- One file per Canvas domain under `src/tools/`. Tests mirror that path
  under `tests/tools/`.
- Every tool gets a unit test against a mocked `CanvasClient`. No
  exceptions — the test is how you document what endpoint the tool hits.
- `TOOL_MANIFEST.md` is the canonical list. New tools get a row in the
  relevant domain table; removed tools get removed from it. The tests
  assert behaviour; the manifest documents intent.
- Commit messages: short, present-tense, no AI attribution.

## Adding a new tool, end to end

Say you want a tool that lists a course's external tools (the
`/api/v1/courses/:id/external_tools` endpoint, which we don't currently
wrap). It's a read, paginated, course-scoped — a good small example.

### 1. Add the tool to its domain file

Since it's course-scoped, it lives in `src/tools/courses.ts`. Open that
file and add an entry to the `courseTools` array:

```ts
{
    name: "canvas_list_external_tools",
    description:
        "List external tools (LTI integrations) available in a course.",
    inputSchema: z.object({
        course_id: z.number().int().positive(),
        search_term: z.string().optional(),
    }),
    handler: async (args, { canvas }) => {
        const tools = await canvas.collectPaginated(
            `/api/v1/courses/${args.course_id}/external_tools`,
            {
                per_page: 100,
                ...(args.search_term ? { search_term: args.search_term } : {}),
            },
        );
        return jsonResult(tools);
    },
},
```

Notes on the shape:

- `inputSchema` is a zod object. Numeric IDs are `z.number().int().positive()`.
- Optional fields use `z.string().optional()` (or whatever the type).
- In the handler body, spread optional fields conditionally:
  `...(args.foo ? { foo: args.foo } : {})`. This is mandatory — see
  "The `exactOptionalPropertyTypes` gotcha" below.
- Use `canvas.collectPaginated` for any Canvas endpoint that honours
  `per_page` and returns a list. Use `canvas.get` for single-resource
  endpoints. Use `canvas.post` / `canvas.put` / `canvas.delete` for the
  corresponding verbs.
- Return with `jsonResult(value)` — it stringifies and wraps the payload
  in the MCP text-content envelope.

### 2. Add the test

Open `tests/tools/courses.test.ts` and add:

```ts
it("canvas_list_external_tools calls collectPaginated with the course's endpoint", async () => {
    const collect = vi.fn().mockResolvedValue([
        { id: 7, name: "Panopto" },
    ]);
    const tool = findTool("canvas_list_external_tools");
    const result = await tool.handler(
        { course_id: 42 },
        { canvas: fakeCanvas({ collectPaginated: collect }) },
    );
    expect(collect).toHaveBeenCalledWith(
        "/api/v1/courses/42/external_tools",
        expect.objectContaining({ per_page: 100 }),
    );
    expect(result.content[0].text).toContain("Panopto");
});
```

The `findTool` and `fakeCanvas` helpers are already in the test file.
Every test in every domain follows this same shape: mock the client
method, call the handler, assert the endpoint and returned payload
preview.

### 3. Add a manifest entry

Open `TOOL_MANIFEST.md`, find the `## courses` table, add a row:

```markdown
| canvas_list_external_tools | GET /api/v1/courses/:course_id/external_tools | course_id, search_term? | — | paginated |
```

Source column is 1-3 reference repos (under `reference/`) whose
implementation most directly informed yours. If it's a fresh addition,
leave it as `—` or put your GitHub handle.

### 4. Verify

```bash
npm test
npm run typecheck
npm run build
```

All three must pass. If typecheck complains about an optional property,
see the gotcha below.

### 5. Commit

```bash
git add src/tools/courses.ts tests/tools/courses.test.ts TOOL_MANIFEST.md
git commit -m "add canvas_list_external_tools"
```

That's it. No router wiring, no tool registration — `src/tools/index.ts`
picks up the new entry automatically via the domain's exported array.

## The `exactOptionalPropertyTypes` gotcha

The tsconfig has `exactOptionalPropertyTypes: true`. This means:

```ts
// Does NOT typecheck
const body = {
    name: args.name,
    description: args.description,  // error if description is `string | undefined`
};
```

You have to write:

```ts
const body = {
    name: args.name,
    ...(args.description ? { description: args.description } : {}),
};
```

For optional numeric fields (where `0` is a valid value) use
`!== undefined` instead of a truthiness check:

```ts
...(args.points_possible !== undefined ? { points_possible: args.points_possible } : {}),
```

Same rule applies whenever a tool passes optional fields to
`canvas.get` / `canvas.post` etc. — query objects and body objects both
follow this pattern. Every existing tool does it; copy the closest
neighbour if you're unsure.

## Live verification

`scripts/verify-tools.mjs` walks every active tool against a real
Canvas instance. Useful when you're:

- Adding a tool and want to check the real Canvas response shape.
- Upgrading the MCP SDK or zod.
- Pointing the server at a new institution for the first time.

```bash
CANVAS_API_TOKEN=... CANVAS_DOMAIN=... node scripts/verify-tools.mjs
```

The script discovers IDs as it goes (first course, first assignment,
etc.) and logs each call. It skips the three side-effect tools
(`mark_module_item_read`, `mark_module_item_done`,
`mark_conversation_read`) by default — edit the `SIDE_EFFECT` set in
the script if you want to exercise them too.

## Trimming and forking

If you want a canvas-mcp variant that only exposes a subset — say, a
student-safe read-only build — delete or comment out the tool objects
you don't want from the relevant domain files and rebuild. Tools are
standalone entries in an array; removing one has no side effects on
the others.

## Found a duplicate?

If you notice a tool that duplicates another (same endpoint, trivially
different params), open an issue instead of adding a third variant.
The original cross-reference sweep aimed to collapse these; anything
missed should be collapsed, not multiplied.
