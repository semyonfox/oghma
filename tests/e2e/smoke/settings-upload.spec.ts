import { expect, test } from "../fixtures";

test.describe("settings and upload smoke", () => {
  test("settings loads profile and default settings for a real session", async ({
    loggedInPage: page,
  }) => {
    await expect(page.getByText("Loading...", { exact: true })).toBeHidden();
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveValue(
      /student\.e2e@example\.com/,
    );
    await expect(page.getByRole("button", { name: /Sign out/i })).toBeVisible();
  });

  test("small PNG upload stores and streams through the app", async ({
    loggedInPage: page,
  }) => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const response = await page.request.post("/api/upload", {
      multipart: {
        file: {
          name: "e2e-upload.png",
          mimeType: "image/png",
          buffer: png,
        },
      },
      headers: { origin: new URL(page.url()).origin },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.createdNewNote).toBe(true);

    const stream = await page.request.get(body.url);
    expect(stream.status()).toBe(200);
    expect(stream.headers()["content-type"]).toContain("image/png");
    expect(await stream.body()).toEqual(png);
  });

  test("SVG upload remains blocked", async ({ loggedInPage: page }) => {
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

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "File type 'image/svg+xml' is not allowed",
    });
  });

  test("browser can PUT a presigned vault archive", async ({
    loggedInPage: page,
  }) => {
    // Production storage is HTTPS; bypass the app CSP only so local HTTP MinIO
    // can exercise the browser's real CORS enforcement.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.setBypassCSP", { enabled: true });
    await page.reload();
    await expect(page.getByText("Loading...", { exact: true })).toBeHidden();
    const zip = Buffer.from([
      0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    const presign = await page.request.post("/api/vault/import", {
      data: { filename: "cors-check.zip", contentLength: zip.length },
      headers: { origin: new URL(page.url()).origin },
    });

    expect(presign.status()).toBe(200);
    const { uploadUrl, contentLength } = await presign.json();
    expect(contentLength).toBe(zip.length);

    const upload = await page.evaluate(
      async ({ url, bytes, expectedSize }) => {
        const response = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/zip",
            "x-amz-meta-expected-size": String(expectedSize),
          },
          body: new Uint8Array(bytes),
        });
        return { ok: response.ok, status: response.status };
      },
      { url: uploadUrl, bytes: Array.from(zip), expectedSize: contentLength },
    );

    expect(upload).toEqual({ ok: true, status: 200 });
  });
});
