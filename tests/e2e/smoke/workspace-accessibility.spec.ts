import { expect, test, type Page } from "@playwright/test";

const noteId = "550e8400-e29b-41d4-a716-446655440000";

async function mockWorkspace(page: Page, baseURL: string, empty = false) {
  let rejectSaves = true;
  let savedContent = "# Systems lecture\n\nThreads share process memory.";
  await page.context().addCookies([{
    name: "session",
    value: "synthetic-local-ui-only",
    url: baseURL,
  }]);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    let status = 200;
    if (path === "/api/auth/me") {
      body = { user: { user_id: "synthetic-user", email: "student@example.test" } };
    } else if (path === "/api/tree/children") {
      body = { parentId: "root", items: empty ? [] : [
        { id: noteId, title: "Systems lecture", isFolder: false },
      ] };
    } else if (path === `/api/notes/${noteId}`) {
      const updating = ["PUT", "PATCH"].includes(route.request().method());
      if (updating && !rejectSaves) {
        const payload: unknown = route.request().postDataJSON();
        const content: unknown = payload && typeof payload === "object"
          ? Reflect.get(payload, "content") : undefined;
        if (typeof content !== "string") throw new Error("Save omitted Markdown content");
        savedContent = content;
      }
      if (updating && rejectSaves) {
        status = 503;
        body = { error: "Synthetic save unavailable" };
      } else {
        body = {
          id: noteId, title: "Systems lecture", isFolder: false, pinned: 0,
          content: savedContent,
          createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z",
        };
      }
    } else if (path.includes("/tags")) {
      body = [];
    } else if (path.includes("/tasks")) {
      body = { tasks: [] };
    } else if (path === "/api/settings") {
      body = { editorsize: "normal", theme: "dark" };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { allowSave: () => { rejectSaves = false; }, savedContent: () => savedContent };
}

test.use({ trace: "off", video: "off" });

test("keyboard retry keeps focus in the editor when its save action disappears", async ({ page, baseURL, isMobile }, testInfo) => {
  test.skip(isMobile, "desktop keyboard flow");
  if (!baseURL) throw new Error("Missing browser base URL");
  const workspace = await mockWorkspace(page, baseURL);
  await page.goto(`/notes/${noteId}`);
  const editor = page.locator('[data-editor-pane="A"] .ProseMirror[contenteditable="true"]');
  await expect(editor).toContainText("Threads share process memory.");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Synthetic revision");
  await page.keyboard.press("Control+s");
  const retry = page.getByRole("button", { name: "Retry save", exact: true });
  await expect(retry).toBeVisible();
  await retry.focus();
  await expect(retry).toBeFocused();
  workspace.allowSave();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-editor-pane="A"]').first()).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(editor).toContainText("Synthetic revision");
  expect(workspace.savedContent()).toContain("Synthetic revision");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Blur revision");
  await page.locator('[data-editor-pane="A"]').first().focus();
  await expect.poll(workspace.savedContent).toContain("Blur revision");
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(page.locator('[data-editor-pane="A"]').first()).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("ux-save-retry-focus.png") });
});

test("all mobile destinations and empty-library content remain reachable with enlarged text", async ({ page, baseURL, isMobile }, testInfo) => {
  test.skip(!isMobile, "mobile reflow flow");
  if (!baseURL) throw new Error("Missing browser base URL");
  await mockWorkspace(page, baseURL, true);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/notes");
  await expect(page.getByRole("button", { name: "New note", exact: true })).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation.getByRole("button", { name: "More", exact: true })).toBeVisible();
  const controls = navigation.locator("a,button");
  await expect(controls).toHaveCount(5);
  for (const control of await controls.all()) {
    const bounds = await control.boundingBox();
    if (!bounds) throw new Error("Navigation control has no visible bounds");
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: testInfo.outputPath("ux-enlarged-navigation.png") });
  const message = page.getByRole("heading", { name: "A place for your notes" });
  await message.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const messageBounds = await message.boundingBox();
  const dockBounds = await navigation.boundingBox();
  if (!messageBounds || !dockBounds) throw new Error("Library content or navigation is hidden");
  expect(messageBounds.y).toBeGreaterThanOrEqual(0);
  expect(messageBounds.y + messageBounds.height).toBeLessThanOrEqual(dockBounds.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("ux-enlarged-library.png") });
});
