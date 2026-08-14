const CLOUDFLARE_EMAIL_ENDPOINT = "https://api.cloudflare.com/client/v4";

function getFromEmail(): string | undefined {
  return process.env.EMAIL_FROM || process.env.CLOUDFLARE_EMAIL_FROM;
}

function getCloudflareEmailConfig(): { accountId: string; apiToken: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "Cloudflare Email Service not configured (set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_EMAIL_API_TOKEN)",
    );
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

function providerErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  for (const field of ["errors", "messages"] as const) {
    const values = body[field];
    if (!Array.isArray(values) || !isRecord(values[0])) {
      continue;
    }
    const message = values[0].message;
    if (typeof message === "string") return message;
  }
  return undefined;
}

function providerReportedFailure(body: unknown): boolean {
  return Boolean(
    isRecord(body) && body.success === false,
  );
}

export async function sendEmail({
  from,
  to,
  replyTo,
  subject,
  text,
  html,
}: EmailMessage): Promise<void> {
  const { accountId, apiToken } = getCloudflareEmailConfig();
  const response = await fetch(
    `${CLOUDFLARE_EMAIL_ENDPOINT}/accounts/${accountId}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from: assertEmailValue(from, "from email"),
        to: assertEmailValue(to, "recipient email"),
        ...(replyTo
          ? { reply_to: assertEmailValue(replyTo, "reply-to email") }
          : {}),
        subject,
        text,
        html,
      }),
    },
  );

  const body = await response.json().catch(() => null);
  if (!response.ok || providerReportedFailure(body)) {
    const message =
      providerErrorMessage(body) ||
      `Cloudflare Email Service returned HTTP ${response.status}`;
    throw new Error(message);
  }
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
): Promise<void> {
  const fromEmail = getFromEmail();
  if (!fromEmail) {
    throw new Error("Email from-address not configured (set EMAIL_FROM)");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

  const mailOptions = {
    from: fromEmail,
    to: email,
    subject: "Verify your email address",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Verify Your Email</h2>
        <p>Thanks for signing up! Click the button below to verify your email address:</p>
        <a href="${verifyUrl}"
           style="background-color: #4299e1; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 5px; display: inline-block;">
          Verify Email
        </a>
        <p style="margin-top: 20px; color: #666;">This link expires in 24 hours.</p>
        <p style="color: #999; font-size: 12px;">If you didn't create an account, ignore this email.</p>
      </div>
    `,
    text: `Verify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
  };

  try {
    await sendEmail(mailOptions);
  } catch (err) {
    console.error("[email] failed to send verification email:", errorMessage(err));
    throw new Error("Failed to send verification email");
  }
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
