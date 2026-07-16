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

    if ((page.viewportSize()?.width ?? 1280) < 768) {
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
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Renamed conversation")).toBeVisible();
      await page.getByRole("link", { name: "Renamed conversation" }).hover();
      await page.getByRole("button", { name: "Pin to favorites" }).click();
      await expect(page.getByRole("button", { name: "Unpin" })).toBeVisible();
      await expect(page.getByRole("link", { name: /Configure AI/ })).toBeVisible();
    }
  });
});
