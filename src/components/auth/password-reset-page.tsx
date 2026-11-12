"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Alert } from "@/components/alert";
import {
  authColumnClass,
  authInputClass,
  authLabelClass,
  authLinkClass,
  authPageClass,
  authPrimaryButtonClass,
  authTitleClass,
} from "./auth-styles";
import { getPasswordRequirements } from "@/lib/auth/credentials";
import useI18n from "@/lib/notes/hooks/use-i18n";

type PasswordResetPurpose = "reset" | "change";

function ResetPasswordForm({
  purpose = "reset",
}: {
  purpose?: PasswordResetPurpose;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const redirectTimerRef = useRef<number | null>(null);

  const token = searchParams.get("token") || "";

  useEffect(
    () => () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    },
    [],
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const unmet = getPasswordRequirements(password).find(
      (requirement) => !requirement.met,
    );
    if (unmet) {
      setError(t(unmet.error));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("Passwords do not match"));
      return;
    }

    setLoading(true);

    const run = async () => {
      const res = await fetch("/api/auth/password-reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data: unknown = await res.json().catch(() => null);

      if (res.ok) {
        setMessage(
          purpose === "change"
            ? t("Password changed successfully")
            : t("Password reset successful! Redirecting to login..."),
        );
        redirectTimerRef.current = window.setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } else {
        const serverError =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "";
        setError(serverError ? t(serverError) : t("Failed to reset password"));
      }
    };
    await run()
      .catch((_err: unknown) => {
        setError(t("An error occurred. Please try again."));
      });

    setLoading(false);
  };

  if (!token) {
    return (
      <div className={authPageClass}>
        <div className={authColumnClass}>
          <Alert
            variant="error"
            title={t("Invalid Reset Link")}
            description={t("The password reset link is invalid or missing.")}
          />
          <p className="mt-6 text-center text-sm/6 text-text-secondary">
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

  return (
    <div className={authPageClass}>
      <div className={authColumnClass}>
        <h2 className={authTitleClass}>
          {purpose === "change" ? t("Change password") : t("Reset Password")}
        </h2>
      </div>

      <div className={`mt-8 ${authColumnClass}`}>
        <div>
          <form onSubmit={handleSubmit} className="space-y-5">
            {message && <Alert variant="success" description={message} />}
            {error && <Alert variant="error" description={error} />}

            <div>
              <label
                htmlFor="password"
                className={authLabelClass}
              >
                {t("New Password")}
              </label>
              <div className="mt-1.5">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setPassword(e.target.value)
                  }
                  placeholder={t("Enter new password")}
                  className={authInputClass}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className={authLabelClass}
              >
                {t("Confirm Password")}
              </label>
              <div className="mt-1.5">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("Confirm new password")}
                  className={authInputClass}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className={authPrimaryButtonClass}
              >
                {loading
                  ? t("Resetting...")
                  : purpose === "change"
                    ? t("Change password")
                    : t("Reset Password")}
              </button>
            </div>
          </form>
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

export function PasswordResetPage({
  purpose = "reset",
}: {
  purpose?: PasswordResetPurpose;
}) {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background text-text-tertiary">
          {t("Loading...")}
        </div>
      }
    >
      <ResetPasswordForm purpose={purpose} />
    </Suspense>
  );
}
