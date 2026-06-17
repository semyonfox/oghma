import { expect, test, createNoteViaApi, loginViaUi } from "../fixtures";

test.describe("auth and notes smoke", () => {
  test("seeded user can sign in, open notes, and persist a note", async ({ page }) => {
    await loginViaUi(page);

    const title = `E2E Note ${Date.now()}`;
    const content = `# ${title}\n\nCreated by Playwright smoke.`;
    const note = await createNoteViaApi(page, title, content);

    await page.goto(`/notes/${note.id}`);
    await expect(page.getByText(title).first()).toBeVisible();
    await expect(page.locator(".cm-content")).toContainText("Created by Playwright smoke.");

    const updated = `${content}\n\nSaved through the real notes API.`;
    const updateResponse = await page.request.put(`/api/notes/${note.id}`, {
      data: { content: updated },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(updateResponse.status()).toBe(200);

    await page.reload();
    await expect(page.locator(".cm-content")).toContainText("Saved through the real notes API.");
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

