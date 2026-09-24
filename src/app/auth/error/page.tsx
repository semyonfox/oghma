"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";

function AuthErrorContent() {
  const { t } = useI18n();
  const params = useSearchParams();
  const error = params.get("error") ?? "Default";
  const messages: Record<string, string> = {
    OAuthSignin: t("Could not start sign-in. Try again."),
    OAuthCallback: t("Sign-in did not finish. Try again from the sign-in page."),
    OAuthCreateAccount: t("Could not create your account. Try again."),
    OAuthAccountNotLinked: t(
      "This email is already registered with another sign-in method. Use that method, then link accounts in settings.",
    ),
    Callback: t("Sign-in did not finish. Try again."),
    AccessDenied: t("Access was denied. Try another sign-in method."),
    Configuration: t("Sign-in is unavailable. Please contact support."),
    Verification: t("The sign-in link expired or was already used. Try again."),
    Default: t("An unexpected sign-in error occurred. Try again."),
  };
  const message = messages[error] ?? messages.Default;

  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-app-page">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="glass-card px-6 py-12 rounded-radius-xl sm:px-12">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <ExclamationTriangleIcon
                className="h-6 w-6 text-red-400"
                aria-hidden="true"
              />
            </div>
            <h2 className="text-xl font-semibold text-text mb-2">
              {t("Sign-in failed")}
            </h2>
            <p className="text-sm text-text-tertiary mb-1">{message}</p>
            {process.env.NODE_ENV === "development" && (
              <p className="mt-2 text-xs text-text-tertiary font-mono glass-card rounded-radius-sm px-2 py-1">
                error code: {error}
              </p>
            )}
          </div>
          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/login"
              className="flex w-full justify-center rounded-radius-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-text-on-primary hover:bg-primary-700"
            >
              {t("Try signing in again")}
            </Link>
            <Link
              href="/contact"
              className="flex w-full justify-center rounded-radius-md glass-card-interactive px-3 py-1.5 text-sm font-semibold text-text-secondary"
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
