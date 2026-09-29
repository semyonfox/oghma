import { expect, test } from "../fixtures";

test.describe("chat streaming", () => {
  for (const interrupted of [false, true]) {
    test(`keeps the answer and hides the activity trace after ${interrupted ? "provider interruption" : "completion"} and reload`, async ({
      loggedInPage: page,
    }, testInfo) => {
      await page.goto("/chat");
      const useNotes = page.getByRole("button", { name: "Search my notes" });
      if ((await useNotes.getAttribute("aria-pressed")) === "true")
        await useNotes.click();
      const prompt = `E2E ordered chat${interrupted ? " interrupt" : " complete"}`;
      await page
        .getByPlaceholder("Ask anything about your notes…")
        .fill(prompt);
      await page.getByRole("button", { name: "Send message" }).click();
      const chat = page.getByRole("main");
      await expect(
        page.getByRole("button", { name: "Stop generating" }),
      ).toBeHidden({ timeout: 30_000 });
      await expect(
        chat.getByText("The final paragraph stays visible.", { exact: true }),
      ).toBeVisible();
      if (interrupted)
        await expect(
          chat.getByText(
            "Response interrupted while generating. Partial output was saved.",
            { exact: true },
          ),
        ).toHaveCount(1);
      await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/, { timeout: 30_000 });
      await page.reload();
      for (const hiddenText of [
        "First I will consult the app guide.",
        "I am checking the guide.",
        "Now I can use the guide result.",
        "The guide explains how chat works.",
      ]) {
        await expect(chat.getByText(hiddenText, { exact: true })).toHaveCount(0);
      }
      await expect(
        chat.getByText("The final paragraph stays visible.", { exact: true }),
      ).toHaveCount(1);
      await page.screenshot({
        path: testInfo.outputPath("ordered-chat.png"),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }
});
