import { expect, test } from "../fixtures";

test.describe("ordered chat streaming", () => {
  for (const interrupted of [false, true]) {
    test(`keeps the trace after ${interrupted ? "provider interruption" : "completion"} and reload`, async ({
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
        chat.getByText("I am checking the guide.", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        chat.getByText("The guide explains how chat works.", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
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
      // Both activity groups are restored in their original positions.
      const groups = chat.getByRole("button", { name: /Work log/ });
      await expect(groups).toHaveCount(2);
      for (const group of await groups.all()) {
        if ((await group.getAttribute("aria-expanded")) === "false")
          await group.click();
      }
      await expect(
        chat.getByText("First I will consult the app guide.", { exact: true }),
      ).toBeVisible();
      await expect(
        chat.getByText("Now I can use the guide result.", { exact: true }),
      ).toBeVisible();
      const text = await chat.innerText();
      expect(text.indexOf("First I will consult")).toBeLessThan(
        text.indexOf("I am checking"),
      );
      expect(text.indexOf("I am checking")).toBeLessThan(
        text.indexOf("Now I can use"),
      );
      expect(text.indexOf("Now I can use")).toBeLessThan(
        text.indexOf("The guide explains"),
      );
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
