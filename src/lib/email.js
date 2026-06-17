import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { randomUUID } from "node:crypto";

// Amplify blocks AWS_ prefixed env vars, so fall back to SES_ prefix
const sesRegion =
  process.env.AWS_SES_REGION || process.env.SES_REGION || "eu-west-1";
const sesAccessKeyId =
  process.env.AWS_SES_ACCESS_KEY_ID || process.env.SES_ACCESS_KEY_ID;
const sesSecretAccessKey =
  process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.SES_SECRET_ACCESS_KEY;

const ses = new SESClient({
  region: sesRegion,
  ...(sesAccessKeyId && sesSecretAccessKey
    ? {
        credentials: {
          accessKeyId: sesAccessKeyId,
          secretAccessKey: sesSecretAccessKey,
        },
      }
    : {}),
});

function assertHeaderValue(value, fieldName) {
  if (!value || /[\r\n]/.test(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return value;
}

function encodeHeader(value) {
  assertHeaderValue(value, "email header");
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildRawEmail({ from, to, subject, text, html }) {
  const safeFrom = assertHeaderValue(from, "from email");
  const safeTo = assertHeaderValue(to, "recipient email");
  const boundary = `oghma-${randomUUID()}`;

  return [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function sendEmail(mailOptions) {
  const rawEmail = buildRawEmail(mailOptions);
  await ses.send(
    new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(rawEmail, "utf8"),
      },
    }),
  );
}

export async function sendPasswordResetEmail(email, resetToken) {
  const fromEmail =
    process.env.AWS_SES_FROM_EMAIL || process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error(
      "SES from-email not configured (set AWS_SES_FROM_EMAIL or SES_FROM_EMAIL)",
    );
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
  const fromEmail =
    process.env.AWS_SES_FROM_EMAIL || process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error(
      "SES from-email not configured (set AWS_SES_FROM_EMAIL or SES_FROM_EMAIL)",
    );
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
  const fromEmail =
    process.env.AWS_SES_FROM_EMAIL || process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    console.warn(
      "[email] SES from-email not configured, skipping vault import notification",
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
  const fromEmail =
    process.env.AWS_SES_FROM_EMAIL || process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    console.warn(
      "[email] SES from-email not configured, skipping vault export notification",
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

/* permissions policy (group name: AWSSESSendingGroupDoNotRename)
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "ses:SendRawEmail",
            "Resource": "*"
        }
    ]
}
*/
