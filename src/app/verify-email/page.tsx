"use client";

import { z } from "zod";
import { useState, Suspense, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Alert } from "@/components/alert";
import {
  authColumnClass,
  authInputClass,
  authLabelClass,
  authLinkClass,
  authPageClass,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
  authSuccessTextClass,
  authTitleClass,
} from "@/components/auth/auth-styles";
import { getPasswordRequirements } from "@/lib/auth/credentials";
import useI18n from "@/lib/notes/hooks/use-i18n";

function VerifyEmailContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token");
  const email = searchParams.get("email") || "";

  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const passwordRequirements = getPasswordRequirements(password);
  let instructions = email
    ? t(
        "We sent a verification link to {email}. Click the link to verify your account.",
        { email },
      )
    : t(
        "We sent a verification link to your email. Click the link to verify your account.",
      );
  if (token) {
    instructions = t(
      "Choose a password only you know to finish verifying your account.",
    );
  }
  if (resendMessage) {
    instructions = "";
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const unmet = passwordRequirements.find((requirement) => !requirement.met);
    if (unmet) {
      setError(t(unmet.error));
      return;
    }
    setVerifying(true);
    setError("");
    const run = async () => {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const error = z
          .object({ error: z.string().max(500) })
          .safeParse(await response.json().catch(() => null));
        throw new Error(
          error.success
            ? error.data.error
            : t("Verification failed. The link may have expired."),
        );
      }
      setPassword("");
      setVerified(true);
      setTimeout(() => router.replace("/notes"), 2000);
    };
    await run()
      .catch((error: unknown) => {
        setError(error instanceof Error ? error.message : t("Verification failed. The link may have expired."));
      })
      .finally(() => {
        setVerifying(false);
      });
  }

  const handleResend = async () => {
    if (!email) return;
    setResendLoading(true);
    setResendMessage("");
    setError("");

    const run = async () => {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setResendMessage(
          t(
            "If this address needs verification, a new link has been requested. Check your inbox and spam folder.",
          ),
        );
      } else {
        setError(t("We couldn't resend the link. Try again later."));
      }
    };
    await run()
      .catch(() => {
        setError(t("An error occurred. Please try again."));
      })
      .finally(() => {
        setResendLoading(false);
      });
  };

  // verifying state
  if (verifying) {
    return (
      <div className={authPageClass}>
        <div className={authColumnClass}>
          <h2 className={authTitleClass}>
            {t("Verifying your email...")}
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            {t("Please wait a moment.")}
          </p>
        </div>
      </div>
    );
  }

  // verified state
  if (verified) {
    return (
      <div className={authPageClass}>
        <div className={authColumnClass}>
          <Alert
            variant="success"
            title={t("Email verified!")}
            description={t(
              "Your email has been verified. Redirecting to your notes...",
            )}
          />
        </div>
      </div>
    );
  }

  // default: check your inbox (no token) or error (bad token)
  return (
    <div className={authPageClass}>
      <div className={authColumnClass}>
        <h2 className={authTitleClass}>
          {token ? t("Verify email") : t("Check your email")}
        </h2>
        {instructions && (
          <p className="mt-2 text-sm text-text-secondary">
            {instructions}
          </p>
        )}
      </div>

      <div className={`mt-8 ${authColumnClass}`}>
        <div className="space-y-5">
          {error && <Alert role="alert" variant="error" description={error} />}
          {resendMessage && (
            <Alert role="status" variant="info" description={resendMessage} />
          )}

          {token && (
            <form onSubmit={verify} className="space-y-4">
              <label
                htmlFor="verification-password"
                className={authLabelClass}
              >
                {t("New password")}
              </label>
              <input
                id="verification-password"
                type="password"
                autoComplete="new-password"
                required
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="verification-password-requirements"
                className={authInputClass}
              />
              <ul
                id="verification-password-requirements"
                className="grid gap-1 text-xs sm:grid-cols-2"
              >
                {passwordRequirements.map((requirement) => (
                  <li
                    key={requirement.id}
                    className={
                      requirement.met
                        ? authSuccessTextClass
                        : "text-text-tertiary"
                    }
                  >
                    <span aria-hidden="true" className="mr-1.5">
                      {requirement.met ? "✓" : "○"}
                    </span>
                    {t(requirement.label)}
                  </li>
                ))}
              </ul>
              <button
                type="submit"
                className={authPrimaryButtonClass}
              >
                {t("Verify email")}
              </button>
            </form>
          )}
          {email && (
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className={token ? authSecondaryButtonClass : authPrimaryButtonClass}
            >
              {resendLoading ? t("Sending...") : t("Resend verification email")}
            </button>
          )}

          <p className="text-center text-sm text-text-secondary">
            {t("Didn't receive the email? Check your spam folder.")} {" "}
            <Link href="/contact" className={authLinkClass}>
              {t("Contact support")}
            </Link>
          </p>
        </div>

        <p className="mt-8 text-center text-sm/6 text-text-secondary">
          <Link
            href="/login"
            className={authLinkClass}
          >
            {t("Back to Login")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background text-text-tertiary">
          {t("Loading...")}
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
