const CLOUDFLARE_EMAIL_ENDPOINT = "https://api.cloudflare.com/client/v4";

function getFromEmail() {
  return process.env.EMAIL_FROM || process.env.CLOUDFLARE_EMAIL_FROM;
}

function getCloudflareEmailConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "Cloudflare Email Service not configured (set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_EMAIL_API_TOKEN)",
    );
  }

  return { accountId, apiToken };
}

function assertEmailValue(value, fieldName) {
  if (!value || /[\r\n]/.test(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return value;
}

export async function sendEmail({ from, to, replyTo, subject, text, html }) {
  const { accountId, apiToken } = getCloudflareEmailConfig();
  const response = await fetch(
    `${CLOUDFLARE_EMAIL_ENDPOINT}/accounts/${accountId}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5_000),
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
  if (!response.ok || body?.success === false) {
    const message =
      body?.errors?.[0]?.message ||
      body?.messages?.[0]?.message ||
      `Cloudflare Email Service returned HTTP ${response.status}`;
    throw new Error(message);
  }
}

export async function sendPasswordResetEmail(email, resetToken) {
  const fromEmail = getFromEmail();
  if (!fromEmail) {
    throw new Error("Email from-address not configured (set EMAIL_FROM)");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const mailOptions = {
    from: fromEmail,
    to: email,
    subject: "Password Reset Request",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset Your Password</h2>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}" 
           style="background-color: #4299e1; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 5px; display: inline-block;">
          Reset Password
        </a>
        <p style="margin-top: 20px; color: #666;">This link expires in 1 hour.</p>
        <p style="color: #999; font-size: 12px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
  };

  try {
    await sendEmail(mailOptions);
  } catch (err) {
    console.error("[email] failed to send password reset:", err.message);
    throw new Error("Failed to send password reset email");
  }
}

export async function sendVerificationEmail(email, verificationToken) {
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
    console.error("[email] failed to send verification email:", err.message);
    throw new Error("Failed to send verification email");
  }
}

export async function sendVaultImportCompleteEmail(
  email,
  { totalFiles, totalFolders, failedFiles },
) {
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
      err.message,
    );
  }
}

export async function sendVaultExportCompleteEmail(email, { downloadUrl }) {
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
      err.message,
    );
  }
}
