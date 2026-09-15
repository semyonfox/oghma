import { expect, test } from "../fixtures";

test.describe("public smoke", () => {
  test("mounted tracker records a public page view", async ({ page }) => {
    const events: Array<Record<string, unknown>> = [];
    await page.route("**/api/marketing/events", async (route) => {
      const payload: unknown = route.request().postDataJSON();
      if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
        events.push(payload as Record<string, unknown>);
      }
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ accepted: true }),
      });
    });

    await page.goto("/");

    await expect.poll(() =>
      events.some(
        (event) => event.eventName === "page_view" && event.path === "/",
      ),
    ).toBe(true);
  });

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

    await page.goto("/syntax-guide");
    await expect(
      page.getByRole("heading", { name: /Markdown Syntax Guide/i }),
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
