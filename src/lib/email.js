import nodemailer from 'nodemailer';

// Amplify blocks AWS_ prefixed env vars, so fall back to SES_ prefix
const sesRegion = process.env.AWS_SES_REGION || process.env.SES_REGION || 'eu-north-1';
const transporter = nodemailer.createTransport({
    host: `email-smtp.${sesRegion}.amazonaws.com`,
    port: 587,
    secure: false,
    auth: {
        user: process.env.AWS_SES_ACCESS_KEY_ID || process.env.SES_ACCESS_KEY_ID,
        pass: process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.SES_SECRET_ACCESS_KEY,
    },
});

export async function sendPasswordResetEmail(email, resetToken) {
    const fromEmail = process.env.AWS_SES_FROM_EMAIL || process.env.SES_FROM_EMAIL;
    if (!fromEmail) {
        throw new Error('SES from-email not configured (set AWS_SES_FROM_EMAIL or SES_FROM_EMAIL)');
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
        from: fromEmail,
        to: email,
        subject: 'Password Reset Request',
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
        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error('[email] failed to send password reset:', err.message);
        throw new Error('Failed to send password reset email');
    }
}

export async function sendVerificationEmail(email, verificationToken) {
    const fromEmail = process.env.AWS_SES_FROM_EMAIL || process.env.SES_FROM_EMAIL;
    if (!fromEmail) {
        throw new Error('SES from-email not configured (set AWS_SES_FROM_EMAIL or SES_FROM_EMAIL)');
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

    const mailOptions = {
        from: fromEmail,
        to: email,
        subject: 'Verify your email address',
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
        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error('[email] failed to send verification email:', err.message);
        throw new Error('Failed to send verification email');
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