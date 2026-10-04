import { expect, test } from "../fixtures";

test.describe("chat with deterministic provider", () => {
  test("streams a worker answer and restores the persisted response", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/chat");

    const useNotes = page.getByRole("button", { name: "Search my notes" });
    if ((await useNotes.getAttribute("aria-pressed")) === "true") {
      await useNotes.click();
    }

    const prompt = "Return the nightly deterministic E2E answer.";
    await page.getByPlaceholder("Ask anything about your notes…").fill(prompt);
    await page.getByRole("button", { name: "Send message" }).click();

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
