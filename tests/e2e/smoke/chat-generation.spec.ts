import { expect, test } from "../fixtures";

test.describe("background chat generation", () => {
  test("streams a worker answer and restores the persisted response", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/chat");

    const useNotes = page.getByRole("button", { name: "Search my notes" });
    if ((await useNotes.getAttribute("aria-pressed")) === "true") {
      await useNotes.click();
    }

    const prompt = "Return the deterministic E2E answer.";
    await page.getByPlaceholder("Ask anything about your notes…").fill(prompt);

    const accepted = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === "/api/chat" &&
        response.status() === 202
      );
    });
    await page.getByRole("button", { name: "Send message" }).click();
    await accepted;

    const chat = page.getByRole("main");
    await expect(chat.getByText("E2E fake answer.", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);

    await page.reload();
    await expect(chat.getByText(prompt, { exact: true }).last()).toBeVisible();
    await expect(chat.getByText("E2E fake answer.", { exact: true })).toHaveCount(1);
  });
});
