import type { Metadata } from "next";
import { Suspense } from "react";
import MobileSignIn from "./sign-in";

export const metadata: Metadata = {
  title: "Sign in to the Android app",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function MobileSignInPage() {
  return (
    <Suspense fallback={<p className="p-8 text-text">Opening sign-in…</p>}>
      <MobileSignIn />
    </Suspense>
  );
}
