import { expect, test } from "../fixtures";

test.describe("public smoke", () => {
  test("key public pages render", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /Your whole semester, already loaded/i,
      }),
    ).toBeVisible();

    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", {
        name: /Pricing built around the academic term/i,
      }),
    ).toBeVisible();

    for (const path of [
      "/about",
      "/blog",
      "/contact",
      "/ai",
      "/info",
      "/privacy",
      "/terms",
      "/cookies",
    ]) {
      const response = await page.goto(path);
      expect(response?.ok(), `${path} should return a successful response`).toBe(
        true,
      );
      await expect(page.locator("body")).not.toBeEmpty();
    }

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
