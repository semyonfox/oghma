import { createNoteViaApi, expect, test } from "../fixtures";

test("a toolbar user can reference a note and create a backlink", async ({
  loggedInPage: page,
}) => {
  const suffix = Date.now();
  const target = await createNoteViaApi(
    page,
    `Reference target ${suffix}`,
    "The target note provides supporting detail.",
  );
  const source = await createNoteViaApi(
    page,
    `Reference source ${suffix}`,
    "This note needs a reference.",
  );

  await page.goto(`/notes/${source.id}`);
  const editor = page.getByRole("main", { name: "Note editor" });
  await expect(editor.getByRole("button", { name: "Reference note" })).toBeVisible();

  await editor.getByRole("button", { name: "Reference note" }).click();
  const picker = editor.getByRole("dialog", { name: "Reference a note" });
  await picker.getByPlaceholder("Search notes…").fill(target.title);
  await picker.getByRole("option", { name: target.title }).click();

  const content = editor
    .locator(".oghma-milkdown-editor [contenteditable='true']")
    .first();
  await expect(content).toContainText(target.title);
  await editor.getByRole("button", { name: "Unsaved" }).click();
  await expect(editor.getByText("Saved", { exact: true })).toBeVisible();

  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/notes/${source.id}`);
      return (await response.json()).content;
    })
    .toContain(`[${target.title}](/notes/${target.id})`);

  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/notes/${target.id}/backlinks`);
      const payload = await response.json();
      return payload.incoming.map((note: { id: string }) => note.id);
    })
    .toContain(source.id);

  await editor.getByRole("button", { name: "Toggle metadata panel" }).click();
  const linksTo = page.getByText("Links to", { exact: true });
  await expect(linksTo).toBeVisible();
  await expect(linksTo.locator("..").getByText(target.title)).toBeVisible();

  await content.focus();
  await page.keyboard.press("End");
  await page.keyboard.type("[[");
  await expect(
    editor.getByRole("dialog", { name: "Reference a note" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  const deleteResponse = await page.request.delete(`/api/notes/${target.id}`, {
    headers: { origin: new URL(page.url()).origin },
  });
  expect(deleteResponse.status()).toBe(200);
  const hiddenWhileDeleted = await page.request.get(
    `/api/notes/${source.id}/backlinks`,
  );
  expect(
    (await hiddenWhileDeleted.json()).outgoing.map(
      (note: { id: string }) => note.id,
    ),
  ).not.toContain(target.id);

  const restoreResponse = await page.request.post("/api/trash", {
    data: { action: "restore", data: { id: target.id } },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(restoreResponse.status()).toBe(200);
  const restoredLinks = await page.request.get(
    `/api/notes/${source.id}/backlinks`,
  );
  expect(
    (await restoredLinks.json()).outgoing.map((note: { id: string }) => note.id),
  ).toContain(target.id);

  const clearResponse = await page.request.put(`/api/notes/${source.id}`, {
    data: { content: "" },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(clearResponse.status()).toBe(200);
  expect((await clearResponse.json()).content).toBe("");
  const backlinksAfterClear = await page.request.get(
    `/api/notes/${target.id}/backlinks`,
  );
  expect(
    (await backlinksAfterClear.json()).incoming.map(
      (note: { id: string }) => note.id,
    ),
  ).not.toContain(source.id);

  const selfReferenceResponse = await page.request.put(
    `/api/notes/${source.id}`,
    {
      data: { content: `[Self](/notes/${source.id})` },
      headers: { origin: new URL(page.url()).origin },
    },
  );
  expect(selfReferenceResponse.status()).toBe(200);
  const selfReferences = await page.request.get(
    `/api/notes/${source.id}/backlinks`,
  );
  expect((await selfReferences.json()).outgoing).toEqual([]);
});
