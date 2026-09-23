import { expect, test } from "../fixtures";

const sessions = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Mobile chat history",
    note_id: null,
    note_title: null,
    context: null,
    message_count: 2,
    created_at: "2026-07-16T12:00:00.000Z",
    pinned: false,
  },
];

test.describe("chat responsive smoke", () => {
  test("sends on the first tap without blurring before submit or shrinking text", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    await page.route("**/api/chat/sessions", (route) =>
      route.fulfill({ json: { sessions: [] } }),
    );
    let sends = 0;
    await page.route("**/api/chat", async (route) => {
      sends++;
      await route.fulfill({
        status: 202,
        json: { sessionId: sessions[0].id, generationId: "composer-check" },
      });
    });
    await page.route("**/api/chat/generations/composer-check/stream*", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: 'event: token\ndata: {"text":"A readable answer."}\n\n',
      }),
    );
    await page.goto("/chat");
    const options = page.getByRole("button", { name: "Search my notes", exact: true });
    await expect(options).toBeVisible();
    const pressed = await options.getAttribute("aria-pressed");
    await options.click();
    await expect(options).toHaveAttribute("aria-pressed", pressed === "true" ? "false" : "true");

    const input = page.getByRole("textbox", { name: "Ask anything about your notes…" });
    await input.fill("Keep this text the same size after sending.");
    const typography = await input.evaluate((element) => {
      const style = getComputedStyle(element);
      // Model the layout shift that dismissing a phone keyboard can cause.
      let submitted = false;
      element.closest("form")?.addEventListener("submit", () => { submitted = true; });
      element.addEventListener("blur", () => {
        if (!submitted) element.closest("form")?.setAttribute("style", "transform: translateY(-80px)");
      });
      return { fontSize: style.fontSize, lineHeight: style.lineHeight };
    });
    const send = page.getByRole("button", { name: "Send message", exact: true });
    if (isMobile) await send.tap();
    else await send.click();
    await expect.poll(() => sends).toBe(1);
    const message = page.getByText("Keep this text the same size after sending.", { exact: true });
    await expect(message).toBeVisible();
    await expect(message).toHaveCSS("font-size", typography.fontSize);
    await expect(message).toHaveCSS("line-height", typography.lineHeight);
    await expect(page.locator("form")).not.toHaveAttribute("style", /translateY/);
  });

  test("mobile sheets and history drawers dismiss with outward swipes", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Touch gestures apply to the mobile layout");
    await page.route("**/api/chat/sessions", (route) =>
      route.fulfill({ json: { sessions } }),
    );
    await page.goto("/chat");
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (x: number, y: number, dx: number, dy: number) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8 }],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    try {
      await page.getByRole("button", { name: "More", exact: true }).tap();
      const title = page.getByRole("heading", { name: "More", exact: true });
      await expect(title).toBeVisible();
      // Wait for the entrance transition before starting a physical touch path.
      await page.getByRole("dialog", { name: "More", exact: true }).evaluate(async (element) => {
        await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
      });
      const sheetBox = await title.boundingBox();
      if (!sheetBox) throw new Error("More sheet title has no bounds");
      await swipe(sheetBox.x + 40, sheetBox.y + 10, 0, 100);
      await expect(title).not.toBeVisible();

      await page.getByRole("button", { name: "Chat history", exact: true }).tap();
      const drawer = page.getByRole("dialog", { name: "Chat history", exact: true });
      const historyTitle = drawer.getByRole("heading", { name: "Chat history", exact: true });
      await expect(historyTitle).toBeVisible();
      await drawer.evaluate(async (element) => {
        await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
      });
      const drawerBox = await historyTitle.boundingBox();
      if (!drawerBox) throw new Error("History drawer title has no bounds");
      await swipe(drawerBox.x + 150, drawerBox.y + 10, -100, 0);
      await expect(drawer).not.toBeVisible();
    } finally {
      await cdp.detach();
    }
  });

  test("keeps chat primary and exposes conversation history", async ({
    loggedInPage: page,
  }) => {
    await page.route("**/api/chat/sessions", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({ status: 200, json: { sessions } });
    });
    await page.route("**/api/chat/sessions/*", async (route) => {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON() as {
          title?: string;
          pinned?: boolean;
        };
        await route.fulfill({
          status: 200,
          json: {
            id: sessions[0].id,
            title: body.title ?? sessions[0].title,
            pinned: body.pinned ?? false,
          },
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/chat");
    await expect(page.getByRole("main")).toBeVisible();

    if ((page.viewportSize()?.width ?? 1280) < 1024) {
      await expect(page.getByText("Mobile chat history")).not.toBeVisible();
      await page.getByRole("button", { name: "Chat history" }).click();
      const drawer = page.getByRole("dialog");
      await expect(drawer.getByText("Mobile chat history")).toBeVisible();
      await expect(
        drawer.getByRole("button", { name: /delete conversation/i }),
      ).toBeVisible();
      await drawer.getByText("Mobile chat history").click();
      await expect(drawer).not.toBeVisible();
    } else {
      await expect(page.getByText("Mobile chat history")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Chat history" }),
      ).not.toBeVisible();
      const conversation = page.getByRole("link", {
        name: "Mobile chat history",
      });
      await conversation.hover();
      await page.getByRole("button", { name: "Rename" }).click();
      const rename = page.getByRole("textbox", { name: "Rename" });
      await rename.fill("Renamed conversation");
      await rename.press("Enter");
      await expect(page.getByText("Renamed conversation")).toBeVisible();
      await page.getByRole("link", { name: "Renamed conversation" }).hover();
      await page.getByRole("button", { name: "Pin to favorites" }).click();
      await expect(page.getByRole("button", { name: "Unpin" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Pinned" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Settings" }),
      ).toHaveCount(1);
    }
  });
});
