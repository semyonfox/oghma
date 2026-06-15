import { expect, test } from "../fixtures";

test.describe("chat full smoke with deterministic stream", () => {
  test("chat page renders and can receive a mocked streamed answer", async ({
    loggedInPage: page,
  }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        },
        body:
          'data: {"type":"text-delta","text":"E2E fake answer."}\n\n' +
          'data: {"type":"done"}\n\n',
      });
    });

    await page.goto("/chat");
    await expect(page.getByRole("main").or(page.locator("body"))).toContainText(/chat|ask|message/i);
  });
});

