import { expect, test as base, type Page } from "@playwright/test";

export const E2E_USER = {
  email: process.env.E2E_SEED_USER_EMAIL || "student.e2e@example.com",
  password: process.env.E2E_SEED_USER_PASSWORD || "E2ePassword123!",
};

export async function loginViaUi(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(E2E_USER.email);
  await page.getByLabel("Password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/notes(?:\/.*)?$/);
  await expect(page.getByRole("main", { name: "Note editor" })).toBeVisible();
}

export async function createNoteViaApi(
  page: Page,
  title: string,
  content: string,
) {
  const response = await page.request.post("/api/notes", {
    data: { title, content },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ id: string; title: string; content: string }>;
}

export const test = base.extend<{
  loggedInPage: Page;
}>({
  loggedInPage: async ({ page }, fixtureUse) => {
    await loginViaUi(page);
    await fixtureUse(page);
  },
});

export { expect };
