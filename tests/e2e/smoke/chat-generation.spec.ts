import { expect, test } from "../fixtures";

test.describe("background chat generation", () => {
  test("streams a worker answer and restores the persisted response", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/chat");

    const isMobile = (page.viewportSize()?.width ?? 1280) < 1024;
    if (isMobile) {
      await page.locator("summary").filter({ hasText: "Chat options" }).click();
    }
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

    // A follow-up used to disappear as soon as loading changed to false,
    // because the initial history snapshot replaced the live messages.
    await page.getByPlaceholder("Ask anything about your notes…").fill("Return a second deterministic E2E answer.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("button", { name: "Stop generating" })).toBeHidden({ timeout: 30_000 });
    await expect(page.getByPlaceholder("Ask anything about your notes…")).toBeEnabled();
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
    await expect(chat.getByText("Return a second deterministic E2E answer.", { exact: true })).toBeVisible();
    await expect(chat.getByText("E2E fake answer.", { exact: true })).toHaveCount(2);

    await page.reload();
    await expect(chat.getByText(prompt, { exact: true }).last()).toBeVisible();
    await expect(chat.getByText("E2E fake answer.", { exact: true })).toHaveCount(2);
  });
});
