import { expect, test } from "../fixtures";

test.describe("public smoke", () => {
  test("key public pages render", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /OghmaNotes: Semantic Notes & RAG Chat/i,
      }),
    ).toBeVisible();

    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { name: /Simple Launch Pricing/i }),
    ).toBeVisible();

    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /Sign in to your account/i }),
    ).toBeVisible();

    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: /Create your account/i }),
    ).toBeVisible();
  });

  test("protected notes page redirects anonymous users", async ({ page }) => {
    await page.goto("/notes");
    await expect(page).toHaveURL(/\/login$/);
  });
});

