"use client";

import { type FormEvent, type ChangeEvent, useState } from "react";
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
} from "@/components/auth/auth-styles";
import useI18n from "@/lib/notes/hooks/use-i18n";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    const run = async () => {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message);
      } else {
        setError(
          data.error ||
            data.message ||
            t("An error occurred. Please try again."),
        );
      }
    };
    await run()
      .catch((_err: unknown) => {
        setError(t("An error occurred. Please try again."));
      });

    setLoading(false);
  };

  return (
    <div className={authPageClass}>
      <div className={authColumnClass}>
        <h2 className={authTitleClass}>
          {t("Forgot Password")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t(
            "Enter your email address and we'll send you a link to reset your password.",
          )}
        </p>
      </div>

      <div className={`mt-8 ${authColumnClass}`}>
        <div>
          <form onSubmit={handleSubmit} className="space-y-5">
            {message && <Alert variant="success" description={message} />}
            {error && <Alert variant="error" description={error} />}

            <div>
              <label
                htmlFor="email"
                className={authLabelClass}
              >
                {t("Email address")}
              </label>
              <div className="mt-1.5">
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  placeholder={t("Enter your email")}
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
                {loading ? t("Sending...") : t("Send Reset Link")}
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
