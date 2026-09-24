import { Locale } from "@/locales";

const CLOUDFLARE_EMAIL_ENDPOINT = "https://api.cloudflare.com/client/v4";

export type EmailDelivery = "delivered" | "queued";

export class EmailSendError extends Error {
  constructor(
    readonly reason:
      | "configuration"
      | "transport"
      | "provider_rejected"
      | "permanent_bounce"
      | "suppressed_recipient"
      | "unclassified_response",
    readonly httpStatus?: number,
    readonly providerCode?: number,
  ) {
    super(`Email sending failed: ${reason.replaceAll("_", " ")}`);
    this.name = "EmailSendError";
  }
}

function getFromEmail(): string | undefined {
  return process.env.EMAIL_FROM || process.env.CLOUDFLARE_EMAIL_FROM;
}

function getCloudflareEmailConfig(): { accountId: string; apiToken: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new EmailSendError("configuration");
  }

  return { accountId, apiToken };
}

function assertEmailValue(value: string, fieldName: string): string {
  if (!value || /[\r\n]/.test(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return value;
}

interface EmailMessage {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

interface VaultImportSummary {
  totalFiles: number;
  totalFolders: number;
  failedFiles: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function providerErrorCode(body: unknown): number | undefined {
  if (!isRecord(body)) return undefined;
  const errors = body.errors;
  if (!Array.isArray(errors) || !isRecord(errors[0])) return undefined;
  return typeof errors[0].code === "number" ? errors[0].code : undefined;
}

function providerReportedFailure(body: unknown): boolean {
  return Boolean(
    isRecord(body) && body.success === false,
  );
}

function hasRecipient(value: unknown, recipient: string): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (entry) =>
        typeof entry === "string" &&
        entry.toLowerCase() === recipient.toLowerCase(),
    )
  );
}

export async function sendEmail({
  from,
  to,
  replyTo,
  subject,
  text,
  html,
}: EmailMessage): Promise<EmailDelivery> {
  const { accountId, apiToken } = getCloudflareEmailConfig();
  const body = JSON.stringify({
    from: assertEmailValue(from, "from email"),
    to: assertEmailValue(to, "recipient email"),
    ...(replyTo
      ? { reply_to: assertEmailValue(replyTo, "reply-to email") }
      : {}),
    subject,
    text,
    html,
  });
  let response: Response;
  try {
    response = await fetch(
      `${CLOUDFLARE_EMAIL_ENDPOINT}/accounts/${accountId}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
        body,
      },
    );
  } catch {
    throw new EmailSendError("transport");
  }

  const result = await response.json().catch(() => null);
  if (!response.ok || providerReportedFailure(result)) {
    throw new EmailSendError(
      "provider_rejected",
      response.status,
      providerErrorCode(result),
    );
  }
  if (!isRecord(result) || result.success !== true || !isRecord(result.result)) {
    throw new EmailSendError("unclassified_response", response.status);
  }
  const delivery = result.result;
  if (hasRecipient(delivery.permanent_bounces, to)) {
    throw new EmailSendError("permanent_bounce", response.status);
  }
  if (hasRecipient(delivery.suppressed_recipients, to)) {
    throw new EmailSendError("suppressed_recipient", response.status);
  }
  if (hasRecipient(delivery.delivered, to)) return "delivered";
  if (hasRecipient(delivery.queued, to)) return "queued";
  throw new EmailSendError("unclassified_response", response.status);
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  resetPath: string = "/reset-password",
): Promise<void> {
  const fromEmail = getFromEmail();
  if (!fromEmail) {
    throw new Error("Email from-address not configured (set EMAIL_FROM)");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const safeResetPath =
    resetPath === "/change-password" ? "/change-password" : "/reset-password";
  const resetUrl = `${baseUrl}${safeResetPath}?token=${encodeURIComponent(resetToken)}`;
  const isPasswordChange = safeResetPath === "/change-password";
  const subject = isPasswordChange
    ? "Confirm your password change"
    : "Password Reset Request";
  const heading = isPasswordChange
    ? "Change Your Password"
    : "Reset Your Password";
  const prompt = isPasswordChange
    ? "Click the button below to confirm your password change:"
    : "Click the button below to reset your password:";
  const action = isPasswordChange ? "Change Password" : "Reset Password";

  const mailOptions = {
    from: fromEmail,
    to: email,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${heading}</h2>
        <p>${prompt}</p>
        <a href="${resetUrl}"
           style="background-color: #4299e1; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 5px; display: inline-block;">
          ${action}
        </a>
        <p style="margin-top: 20px; color: #666;">This link expires in 1 hour.</p>
        <p style="color: #999; font-size: 12px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
    text: `${action}: ${resetUrl}\n\nThis link expires in 1 hour.`,
  };

  try {
    await sendEmail(mailOptions);
  } catch (err) {
    console.error("[email] failed to send password reset:", errorMessage(err));
    throw new Error("Failed to send password reset email");
  }
}

export async function sendVerificationEmail(
  email: string,
  verificationToken: string,
  locale: Locale = Locale.EN,
): Promise<EmailDelivery> {
  const fromEmail = getFromEmail();
  if (!fromEmail) {
    throw new EmailSendError("configuration");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  const copy =
    locale === Locale.de_DE
      ? {
          subject: "Bestätigen Sie Ihre E-Mail-Adresse",
          heading: "Bestätigen Sie Ihre E-Mail-Adresse",
          prompt:
            "Danke für Ihre Anmeldung! Klicken Sie auf die Schaltfläche, um Ihre E-Mail-Adresse zu bestätigen:",
          action: "E-Mail bestätigen",
          expires: "Dieser Link ist 24 Stunden gültig.",
          ignore:
            "Falls Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.",
        }
      : {
          subject: "Verify your email address",
          heading: "Verify Your Email",
          prompt:
            "Thanks for signing up! Click the button below to verify your email address:",
          action: "Verify Email",
          expires: "This link expires in 24 hours.",
          ignore: "If you didn't create an account, ignore this email.",
        };

  const mailOptions = {
    from: fromEmail,
    to: email,
    subject: copy.subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${copy.heading}</h2>
        <p>${copy.prompt}</p>
        <a href="${verifyUrl}"
           style="background-color: #4299e1; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 5px; display: inline-block;">
          ${copy.action}
        </a>
        <p style="margin-top: 20px; color: #666;">${copy.expires}</p>
        <p style="color: #999; font-size: 12px;">${copy.ignore}</p>
      </div>
    `,
    text: `${copy.action}: ${verifyUrl}\n\n${copy.expires}`,
  };

  return sendEmail(mailOptions);
}

export async function sendVaultImportCompleteEmail(
  email: string,
  { totalFiles, totalFolders, failedFiles }: VaultImportSummary,
): Promise<void> {
  const fromEmail = getFromEmail();
  if (!fromEmail) {
    console.warn(
      "[email] from-address not configured, skipping vault import notification",
    );
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const hasFailures = failedFiles > 0;

  const mailOptions = {
    from: fromEmail,
    to: email,
    subject: "Your vault import is complete",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Vault Import Complete</h2>
        <p>Your vault has been imported successfully.</p>
        <ul style="line-height: 1.8;">
          <li><strong>${totalFolders}</strong> folders created</li>
          <li><strong>${totalFiles}</strong> files processed</li>
          ${hasFailures ? `<li style="color: #e53e3e;"><strong>${failedFiles}</strong> files failed</li>` : ""}
        </ul>
        <a href="${baseUrl}"
           style="background-color: #4299e1; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 16px;">
          Open OghmaNote
        </a>
      </div>
    `,
    text: `Vault Import Complete\n\n${totalFolders} folders created, ${totalFiles} files processed${hasFailures ? `, ${failedFiles} failed` : ""}.\n\nOpen OghmaNote: ${baseUrl}`,
  };

  try {
    await sendEmail(mailOptions);
  } catch (err) {
    console.error(
      "[email] failed to send vault import notification:",
      errorMessage(err),
    );
  }
}

export async function sendVaultExportCompleteEmail(
  email: string,
  { downloadUrl }: { downloadUrl: string },
): Promise<void> {
  const fromEmail = getFromEmail();
  if (!fromEmail) {
    console.warn(
      "[email] from-address not configured, skipping vault export notification",
    );
    return;
  }

  const mailOptions = {
    from: fromEmail,
    to: email,
    subject: "Your vault export is ready",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Vault Export Ready</h2>
        <p>Your vault export has been generated and is ready to download.</p>
        <a href="${downloadUrl}"
           style="background-color: #4299e1; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 16px;">
          Download Vault
        </a>
        <p style="margin-top: 20px; color: #666;">This download link expires in 24 hours.</p>
      </div>
    `,
    text: `Vault Export Ready\n\nDownload your vault: ${downloadUrl}\n\nThis link expires in 24 hours.`,
  };

  try {
    await sendEmail(mailOptions);
  } catch (err) {
    console.error(
      "[email] failed to send vault export notification:",
      errorMessage(err),
    );
  }
}
