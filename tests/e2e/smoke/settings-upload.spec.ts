import { expect, test } from "../fixtures";

test.describe("settings and upload smoke", () => {
  test("settings loads profile and default settings for a real session", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveValue(
      /student\.e2e@example\.com/,
    );
    await expect(page.getByRole("button", { name: /Sign out/i })).toBeVisible();
  });

  test("small SVG upload stores and streams through the app", async ({
    loggedInPage: page,
  }) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>`;
    const response = await page.request.post("/api/upload", {
      multipart: {
        file: {
          name: "e2e-upload.svg",
          mimeType: "image/svg+xml",
          buffer: Buffer.from(svg),
        },
      },
      headers: { origin: new URL(page.url()).origin },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.createdNewNote).toBe(true);

    const stream = await page.request.get(body.url);
    expect(stream.status()).toBe(200);
    expect(await stream.text()).toContain("<svg");
  });
});
