"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
import BrandLogo from "@/components/brand-logo";
import { z } from "zod";

const accountSchema = z.object({
  user: z.object({ user_id: z.string().uuid(), email: z.string() }),
});
const replySchema = z.object({ url: z.string() });

export default function MobileSignIn() {
  const params = useSearchParams();
  const provider = params.get("provider") || "";
  const state = params.get("state") || "";
  const codeChallenge = params.get("code_challenge") || "";
  const complete = params.get("complete") === "1";
  const valid =
    ["google", "github"].includes(provider) &&
    /^[a-f0-9]{64}$/.test(state) &&
    /^[A-Za-z0-9_-]{43}$/.test(codeChallenge);
  const [account, setAccount] = useState<
    z.infer<typeof accountSchema>["user"] | null
  >(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnUrl, setReturnUrl] = useState("");
  const started = useRef(false);
  const callback = new URLSearchParams({
    provider,
    state,
    code_challenge: codeChallenge,
    complete: "1",
  });
  const callbackUrl = `/auth/mobile?${callback}`;

  const start = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const providers = await getProviders();
      if (!providers?.[provider])
        throw new Error(
          "This sign-in provider is unavailable. Close this page and try again from the app.",
        );
      await signIn(provider, { callbackUrl, redirect: true });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not open sign-in.",
      );
      setBusy(false);
    }
  }, [provider, callbackUrl]);

  useEffect(() => {
    if (!valid) return;
    if (!complete) {
      if (!started.current) {
        started.current = true;
        void start();
      }
      return;
    }
    let active = true;
    void fetch("/api/auth/mobile/authorize", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Your sign-in expired. Please sign in again.");
        const data = accountSchema.parse(await response.json());
        if (active) setAccount(data.user);
      })
      .catch((error: unknown) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load your account.",
          );
      });
    return () => {
      active = false;
    };
  }, [valid, complete, start]);

  async function approve() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mobile/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, codeChallenge }),
      });
      if (!response.ok)
        throw new Error("Could not finish signing in. Please try again.");
      const { url } = replySchema.parse(await response.json());
      const parsed = new URL(url);
      if (
        parsed.protocol !== "ie.oghmanotes.alpha:" ||
        parsed.host !== "auth" ||
        parsed.searchParams.get("state") !== state
      )
        throw new Error("Unexpected app return address.");
      setReturnUrl(url);
      window.location.assign(url);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not return to the app.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-app-page px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <BrandLogo size={36} />
          <span className="text-xl font-semibold text-text">OghmaNotes</span>
        </div>
        <h1 className="font-serif text-3xl text-text">
          Sign in to your Android app
        </h1>
        {!valid ? (
          <p role="alert" className="text-error-600 dark:text-error-400">
            This sign-in link is incomplete. Close this page and start again
            from the app.
          </p>
        ) : (
          <>
            {error && (
              <p role="alert" className="text-error-600 dark:text-error-400">
                {error}
              </p>
            )}
            {account ? (
              <div className="glass-card space-y-5 rounded-radius-xl p-6">
                <p className="text-text-secondary">
                  Continue with{" "}
                  <strong className="break-all text-text">
                    {account.email}
                  </strong>{" "}
                  on the Android app you opened.
                </p>
                <button
                  type="button"
                  onClick={() => void approve()}
                  disabled={busy}
                  className="min-h-12 w-full rounded-radius-lg bg-primary-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Returning to app…" : "Continue to OghmaNotes"}
                </button>
                {returnUrl && (
                  <a
                    href={returnUrl}
                    className="block text-primary-600 underline dark:text-primary-300"
                  >
                    Open the app
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={busy}
                  className="min-h-12 text-text-secondary underline underline-offset-4"
                >
                  Use another account
                </button>
              </div>
            ) : (
              <>
                <p role="status" className="text-text-secondary">
                  {error
                    ? "You can retry sign-in below."
                    : "Opening your account…"}
                </p>
                {error && (
                  <button
                    type="button"
                    onClick={() => void start()}
                    disabled={busy}
                    className="min-h-12 rounded-radius-lg bg-primary-600 px-6 py-3 font-semibold text-white"
                  >
                    Sign in again
                  </button>
                )}
              </>
            )}
            <p className="text-sm text-text-secondary">
              Only continue if you started sign-in from OghmaNotes on your
              phone. You can close this page to cancel.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
