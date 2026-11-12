"use client";

import { useEffect, useRef, useState, useEffectEvent } from "react";
import { useSearchParams } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
import BrandLogo from "@/components/brand-logo";
import {
  authColumnClass,
  authErrorTextClass,
  authLinkClass,
  authPageClass,
  authPrimaryButtonClass,
  authTitleClass,
} from "@/components/auth/auth-styles";
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

  const start = async () => {
    setBusy(true);
    setError("");
    const run = async () => {
      const providers = await getProviders();
      if (!providers?.[provider])
        throw new Error(
          "This sign-in provider is unavailable. Close this page and try again from the app.",
        );
      await signIn(provider, { callbackUrl, redirect: true });
    };
    await run()
      .catch((error: unknown) => {
        setError(
          error instanceof Error ? error.message : "Could not open sign-in.",
        );
        setBusy(false);
      });
  };

  const startOnMount = useEffectEvent(() => void start());

  useEffect(() => {
    if (!valid) return;
    if (!complete) {
      if (!started.current) {
        started.current = true;
        startOnMount();
      }
      return;
    }
    let active = true;
    void fetch("/api/auth/mobile/authorize", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 503
              ? "App sign-in is awaiting Android link verification. Use email and password in the app for now."
              : "Your sign-in expired. Please sign in again.",
          );
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
  }, [valid, complete]);

  async function approve() {
    setBusy(true);
    setError("");
    const run = async () => {
      const response = await fetch("/api/auth/mobile/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, codeChallenge }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 503
            ? "App sign-in is awaiting Android link verification. Use email and password in the app for now."
            : "Could not finish signing in. Please try again.",
        );
      const { url } = replySchema.parse(await response.json());
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" ||
        parsed.host !== "oghmanotes.ie" ||
        parsed.pathname !== "/auth/mobile/callback" ||
        parsed.username ||
        parsed.password ||
        parsed.hash ||
        parsed.searchParams.get("state") !== state
      )
        throw new Error("Unexpected app return address.");
      setReturnUrl(url);
      window.location.assign(url);
    };
    await run()
      .catch((error: unknown) => {
        setError(
          error instanceof Error ? error.message : "Could not return to the app.",
        );
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <main className={authPageClass}>
      <div className={`${authColumnClass} space-y-6`}>
        <div className="flex items-center gap-2.5">
          <BrandLogo size={30} />
          <span className="font-serif text-lg font-semibold text-text">OghmaNotes</span>
        </div>
        <h1 className={authTitleClass}>
          Sign in to your Android app
        </h1>
        {!valid ? (
          <p role="alert" className={authErrorTextClass}>
            This sign-in link is incomplete. Close this page and start again
            from the app.
          </p>
        ) : (
          <>
            {error && (
              <p role="alert" className={authErrorTextClass}>
                {error}
              </p>
            )}
            {account ? (
              <div className="space-y-5 rounded-radius-xl border border-border bg-surface p-6">
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
                  className={authPrimaryButtonClass}
                >
                  {busy ? "Returning to app…" : "Continue to OghmaNotes"}
                </button>
                {returnUrl && (
                  <a
                    href={returnUrl}
                    className={`block ${authLinkClass}`}
                  >
                    Open the app
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={busy}
                  className="min-h-11 text-sm text-text-secondary underline underline-offset-4 hover:text-text"
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
                    className={`${authPrimaryButtonClass} sm:w-auto sm:px-6`}
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
