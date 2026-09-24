import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailSendError, sendVerificationEmail } from "@/lib/email";
import { Locale } from "@/locales";

const recipient = "student@example.com";

function cloudflareResponse(result: {
  delivered: string[];
  queued: string[];
  permanent_bounces: string[];
  suppressed_recipients?: string[];
}) {
  return Response.json({ success: true, result });
}

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account");
  vi.stubEnv("CLOUDFLARE_EMAIL_API_TOKEN", "test-token");
  vi.stubEnv("EMAIL_FROM", "noreply@example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("verification email delivery", () => {
  it("reports immediate provider delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        cloudflareResponse({
          delivered: [recipient],
          queued: [],
          permanent_bounces: [],
        }),
      ),
    );

    await expect(
      sendVerificationEmail(recipient, "single-use-test-token"),
    ).resolves.toBe("delivered");
  });

  it("reports delivery that is still queued", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        cloudflareResponse({
          delivered: [],
          queued: [recipient],
          permanent_bounces: [],
        }),
      ),
    );

    await expect(
      sendVerificationEmail(recipient, "single-use-test-token"),
    ).resolves.toBe("queued");
  });

  it("sends German verification instructions for a German account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        cloudflareResponse({
          delivered: [recipient],
          queued: [],
          permanent_bounces: [],
        }),
      ),
    );

    await sendVerificationEmail(
      recipient,
      "single-use-test-token",
      Locale.de_DE,
    );

    const requestBody: unknown = JSON.parse(
      String(vi.mocked(fetch).mock.calls[0]?.[1]?.body),
    );
    expect(requestBody).toMatchObject({
      subject: "Bestätigen Sie Ihre E-Mail-Adresse",
      text: expect.stringContaining("Dieser Link ist 24 Stunden gültig."),
      html: expect.stringContaining("E-Mail bestätigen"),
    });
  });

  it("rejects a permanent bounce despite HTTP success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        cloudflareResponse({
          delivered: [],
          queued: [],
          permanent_bounces: [recipient],
        }),
      ),
    );

    await expect(
      sendVerificationEmail(recipient, "single-use-test-token"),
    ).rejects.toThrow("permanent bounce");
  });

  it("identifies a suppressed recipient despite HTTP success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        cloudflareResponse({
          delivered: [],
          queued: [],
          permanent_bounces: [],
          suppressed_recipients: [recipient],
        }),
      ),
    );

    await expect(
      sendVerificationEmail(recipient, "single-use-test-token"),
    ).rejects.toMatchObject({ reason: "suppressed_recipient" });
  });

  it("keeps provider diagnostics to status and code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            success: false,
            errors: [{ code: 10102, message: "private provider detail" }],
          },
          { status: 403 },
        ),
      ),
    );

    const error: unknown = await sendVerificationEmail(
      recipient,
      "single-use-test-token",
    ).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(EmailSendError);
    if (error instanceof EmailSendError) {
      expect(error).toMatchObject({
        reason: "provider_rejected",
        httpStatus: 403,
        providerCode: 10102,
      });
      expect(error.message).not.toContain("private provider detail");
    }
  });
});
