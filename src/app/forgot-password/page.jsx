"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/alert";
import useI18n from "@/lib/notes/hooks/use-i18n";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
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
    } catch (_err) {
      setError(t("An error occurred. Please try again."));
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-app-page">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center font-serif text-2xl font-semibold tracking-tight text-text-secondary">
          {t("Forgot Password")}
        </h2>
        <p className="mt-2 text-center text-sm text-text-tertiary">
          {t(
            "Enter your email address and we'll send you a link to reset your password.",
          )}
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="glass-card px-6 py-12 rounded-radius-xl sm:px-12">
          <form onSubmit={handleSubmit} className="space-y-6">
            {message && <Alert variant="success" description={message} />}
            {error && <Alert variant="error" description={error} />}

            <div>
              <label
                htmlFor="email"
                className="block text-sm/6 font-medium text-text-secondary"
              >
                {t("Email address")}
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("Enter your email")}
                  className="block w-full rounded-radius-md bg-surface border border-border-subtle px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-md bg-primary-500 px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t("Sending...") : t("Send Reset Link")}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-10 text-center text-sm/6 text-text-tertiary">
          <Link
            href="/login"
            className="font-semibold text-primary-400 hover:text-primary-300"
          >
            {t("Back to Login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
