"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Alert } from "@/components/alert";
import useI18n from "@/lib/notes/hooks/use-i18n";

function VerifyEmailContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token");
  const email = searchParams.get("email") || "";
  const deliveryParam = searchParams.get("delivery");
  const delivery =
    deliveryParam === "delivered" ||
    deliveryParam === "queued" ||
    deliveryParam === "failed"
      ? deliveryParam
      : null;

  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const initialSendFailed = delivery === "failed" && !resendMessage;
  let instructions = email
    ? t(
        "We sent a verification link to {email}. Click the link to verify your account.",
        { email },
      )
    : t(
        "We sent a verification link to your email. Click the link to verify your account.",
      );
  if (delivery === "queued") {
    instructions = t(
      "Your verification email is queued. It may take a few minutes to arrive.",
    );
  }
  if (initialSendFailed) {
    instructions = t(
      "We couldn't send the verification email. Your account was created. Try resending once or contact support.",
    );
  }
  if (resendMessage) {
    instructions = "";
  }

  // auto-verify if token is in URL
  useEffect(() => {
    if (!token) return;

    setVerifying(true);
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setVerified(true);
          setTimeout(() => router.replace("/notes"), 2000);
        } else {
          setError(
            data.error || t("Verification failed. The link may have expired."),
          );
        }
      })
      .catch(() => {
        setError(t("An error occurred. Please try again."));
      })
      .finally(() => setVerifying(false));
  }, [token, router, t]);

  const handleResend = async () => {
    if (!email) return;
    setResendLoading(true);
    setResendMessage("");
    setError("");

    try {
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
    } catch {
      setError(t("An error occurred. Please try again."));
    } finally {
      setResendLoading(false);
    }
  };

  // verifying state
  if (verifying) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-12 bg-app-page">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <h2 className="font-serif text-2xl font-semibold text-text">
            {t("Verifying your email...")}
          </h2>
          <p className="mt-2 text-text-tertiary">
            {t("Please wait a moment.")}
          </p>
        </div>
      </div>
    );
  }

  // verified state
  if (verified) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-12 bg-app-page">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
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
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-app-page">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center font-serif text-2xl font-semibold tracking-tight text-text">
          {initialSendFailed
            ? t("Verification email not sent")
            : t("Check your email")}
        </h2>
        {instructions && (
          <p className="mt-2 text-center text-sm text-text-tertiary">
            {instructions}
          </p>
        )}
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="glass-card px-6 py-12 rounded-radius-xl sm:px-12 space-y-6">
          {error && <Alert role="alert" variant="error" description={error} />}
          {resendMessage && (
            <Alert role="status" variant="info" description={resendMessage} />
          )}

          {email && (
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="flex w-full justify-center rounded-radius-md bg-primary-600 px-3 py-1.5 text-sm/6 font-semibold text-text-on-primary hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendLoading ? t("Sending...") : t("Resend verification email")}
            </button>
          )}

          <p className="text-center text-sm text-text-tertiary">
            {t("Didn't receive the email? Check your spam folder.")} {" "}
            <Link href="/contact" className="font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300">
              {t("Contact support")}
            </Link>
          </p>
        </div>

        <p className="mt-10 text-center text-sm/6 text-text-tertiary">
          <Link
            href="/login"
            className="font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
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
        <div className="flex min-h-full items-center justify-center bg-app-page text-text-tertiary">
          {t("Loading...")}
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
