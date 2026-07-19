import { expect, test, createNoteViaApi, loginViaUi } from "../fixtures";

test.describe("auth and notes smoke", () => {
  test("seeded user can sign in, open notes, and persist a note", async ({ page }) => {
    await loginViaUi(page);

    const title = `E2E Note ${Date.now()}`;
    const content = `# ${title}\n\nCreated by Playwright smoke.`;
    const note = await createNoteViaApi(page, title, content);

    await page.reload();
    await expect(page.getByRole("main", { name: "Note editor" })).toBeVisible();

    const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
    if (isMobile) {
      await page.getByRole("button", { name: "Notes list" }).click();
    }
    const notesList = page.getByRole("region", { name: "Notes list" });
    await expect(notesList).toBeVisible();
    await notesList.getByText(title).click();
    await expect(page).toHaveURL(`/notes/${note.id}`);
    if (isMobile) await expect(notesList).not.toBeVisible();

    const editor = page.getByRole("main", { name: "Note editor" });
    const editorContent = editor
      .locator(".oghma-milkdown-editor [contenteditable='true']")
      .first();
    await expect(editor.getByText(title).first()).toBeVisible();
    await expect(editorContent).toContainText("Created by Playwright smoke.");

    if (isMobile) {
      await page.getByTitle("Toggle metadata panel").click();
      const inspector = page.getByRole("dialog");
      await expect(inspector).toBeVisible();
      await inspector.getByRole("button", { name: "Global Tasks" }).click();
      await expect(page.getByRole("dialog", { name: "Global Tasks" })).toBeVisible();
      await inspector.getByRole("button", { name: "Close" }).first().click();
      await expect(inspector).not.toBeVisible();
    }

    const updated = `${content}\n\nSaved through the real notes API.`;
    const updateResponse = await page.request.put(`/api/notes/${note.id}`, {
      data: { content: updated },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(updateResponse.status()).toBe(200);

    await page.reload();
    const reloadedEditor = page.getByRole("main", { name: "Note editor" });
    await expect(reloadedEditor.getByText(title).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      reloadedEditor
        .locator(".oghma-milkdown-editor [contenteditable='true']")
        .first(),
    ).toContainText("Saved through the real notes API.");
  });

  test("registration keeps new users behind email verification", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;

    await page.goto("/register");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("E2ePassword123!");
    await page.getByLabel("Confirm password").fill("E2ePassword123!");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/verify-email\?email=/);

    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("E2ePassword123!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/verify-email\?email=/);
  });
});

