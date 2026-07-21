"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Could not start the sign-in flow. Please try again.",
  OAuthCallback:
    "Something went wrong handling the OAuth callback. The redirect URI may be misconfigured.",
  OAuthCreateAccount: "Could not create your account. Please try again.",
  OAuthAccountNotLinked:
    "This email is already registered with a different sign-in method. Please sign in using the original method and link accounts in settings.",
  Callback: "An error occurred during sign-in. Please try again.",
  AccessDenied: "Access was denied. You may not have permission to sign in.",
  Configuration:
    "There is a server configuration problem. Please contact support.",
  Verification: "The sign-in link has expired or already been used.",
  Default: "An unexpected error occurred. Please try again.",
};

function AuthErrorContent() {
  const params = useSearchParams();
  const error = params.get("error") ?? "Default";
  const message = ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default;

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
              Sign-in failed
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
              Back to sign in
            </Link>
            <Link
              href="/"
              className="flex w-full justify-center rounded-radius-md glass-card-interactive px-3 py-1.5 text-sm font-semibold text-text-secondary"
            >
              Go home
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
