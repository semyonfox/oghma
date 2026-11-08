import type { Metadata } from "next";
import Link from "next/link";
import { getMobileRelease } from "@/lib/mobile-release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Android alpha",
  robots: { index: false, follow: false },
  alternates: { canonical: "/downloads" },
};

export default async function MobileAlphaPage() {
  const release = await getMobileRelease();
  return (
    <main className="bg-background mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <Link href="/" className="font-serif text-lg font-semibold tracking-tight text-text">
        OghmaNotes
      </Link>
      <div className="space-y-4">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-text-tertiary">
          Android alpha
        </p>
        <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight text-text sm:text-5xl">
          Your study space,
          <br />
          in your pocket.
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-text-secondary">
          Your full OghmaNotes workspace on Android. Edit notes with the same
          rich editor, read PDFs inside the app and chat with Oghma.
        </p>
      </div>
      <section
        className="space-y-5 rounded-radius-2xl border border-border bg-surface p-6"
        aria-label="Android download"
      >
        {release ? (
          <>
            <a
              href="/downloads/oghmanotes-alpha.apk"
              download
              className="inline-flex min-h-12 items-center justify-center rounded-radius-md bg-action px-6 py-3 font-semibold text-on-action transition-colors hover:bg-action-hover"
            >
              Download Android alpha
            </a>
            <p className="font-mono text-xs text-text-tertiary">
              Version {release.version} ·{" "}
              {(release.bytes / 1024 / 1024).toFixed(1)} MB · APK
            </p>
            <p className="text-sm leading-relaxed text-text-secondary">
              Open the downloaded file on your Android phone. If Android asks,
              allow your browser to install this app. Install over your existing
              version to keep your data. After this, use App updates inside
              OghmaNotes to download and install future versions.
            </p>
            <details className="text-xs text-text-tertiary">
              <summary className="cursor-pointer py-2">
                Verify download checksum
              </summary>
              <code className="block break-all rounded-radius-sm bg-surface-elevated px-3 py-2 font-mono">{release.sha256}</code>
            </details>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold tracking-tight text-text">
              The first APK is being prepared
            </h2>
            <p className="text-text-secondary">
              The download will appear here when an alpha build is available.
            </p>
          </>
        )}
      </section>
      <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-text">What to expect</h2>
        <p>
          This is an early Android version. Sign in with your existing email and
          password, Google or GitHub. Notes and chat connect to the same account
          as the website.
        </p>
        <p>
          The app includes the website’s editor, PDF viewer, file uploads, chat,
          calendar and quizzes. PDFs render inside OghmaNotes. Your account and
          light, dark or system theme are shared with the website. An internet
          connection is needed to load and sync your work.
        </p>
      </div>
      <Link
        href="/notes"
        className="text-sm font-semibold text-accent hover:text-accent-hover underline underline-offset-4"
      >
        Continue on the website
      </Link>
    </main>
  );
}
