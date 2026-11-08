"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  authColumnClass,
  authPageClass,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
  authTitleClass,
} from "@/components/auth/auth-styles";

function AuthErrorContent() {
  const { t } = useI18n();
  const params = useSearchParams();
  const error = params.get("error") ?? "Default";
  const messages: Record<string, string> = {
    OAuthSignin: t("Could not start sign-in. Try again."),
    OAuthCallback: t("Sign-in did not finish. Try again from the sign-in page."),
    OAuthCreateAccount: t("Could not create your account. Try again."),
    OAuthAccountNotLinked: t(
      "This email is already registered with another sign-in method. Sign in with that method instead.",
    ),
    Callback: t("Sign-in did not finish. Try again."),
    AccessDenied: t("Access was denied. Try another sign-in method."),
    NoVerifiedEmail: t(
      "Your Google or GitHub account has no verified email address. Verify it there, then try again.",
    ),
    AccountDeleted: t(
      "This account was deleted and is waiting for permanent removal. Contact support within 30 days to restore it, or create a new account after that.",
    ),
    Configuration: t("Sign-in is unavailable. Please contact support."),
    Verification: t("The sign-in link expired or was already used. Try again."),
    Default: t("An unexpected sign-in error occurred. Try again."),
  };
  const message = messages[error] ?? messages.Default;

  return (
    <div className={authPageClass}>
      <div className={authColumnClass}>
        <div>
          <div>
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface">
              <ExclamationTriangleIcon
                className="h-5 w-5 text-error-700 dark:text-error-400"
                aria-hidden="true"
              />
            </div>
            <h2 className={`mb-2 ${authTitleClass}`}>
              {t("Sign-in failed")}
            </h2>
            <p className="text-sm text-text-secondary mb-1">{message}</p>
            {process.env.NODE_ENV === "development" && (
              <p className="mt-2 rounded-radius-sm border border-border bg-subtle px-2 py-1 font-mono text-xs text-text-tertiary">
                error code: {error}
              </p>
            )}
          </div>
          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/login"
              className={authPrimaryButtonClass}
            >
              {t("Try signing in again")}
            </Link>
            <Link
              href="/contact"
              className={authSecondaryButtonClass}
            >
              {t("Contact support")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <AuthErrorContent />
    </Suspense>
  );
}
