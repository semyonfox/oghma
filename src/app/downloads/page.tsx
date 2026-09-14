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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <Link href="/" className="text-sm font-semibold text-text-secondary">
        OghmaNotes
      </Link>
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 dark:text-primary-300">
          Android alpha
        </p>
        <h1 className="font-serif text-4xl leading-tight text-text sm:text-5xl">
          Your study space,
          <br />
          in your pocket.
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-text-secondary">
          A new mobile app for your existing OghmaNotes account. Browse your
          notes, edit Markdown and pick up a conversation with Oghma.
        </p>
      </div>
      <section
        className="space-y-5 rounded-2xl border border-border-subtle bg-surface p-6"
        aria-label="Android download"
      >
        {release ? (
          <>
            <a
              href="/downloads/oghmanotes-alpha.apk"
              download
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary-600 px-6 py-3 font-semibold text-white hover:bg-primary-700"
            >
              Download Android alpha
            </a>
            <p className="text-sm text-text-secondary">
              Version {release.version} ·{" "}
              {(release.bytes / 1024 / 1024).toFixed(1)} MB · APK
            </p>
            <p className="text-sm leading-relaxed text-text-secondary">
              Open the downloaded file on your Android phone. If Android asks,
              allow your browser to install this app. Future alpha APKs install
              over the existing app.
            </p>
            <details className="text-xs text-text-tertiary">
              <summary className="cursor-pointer py-2">
                Verify download checksum
              </summary>
              <code className="block break-all py-2">{release.sha256}</code>
            </details>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-text">
              The first APK is being prepared
            </h2>
            <p className="text-text-secondary">
              The download will appear here when an alpha build is available.
            </p>
          </>
        )}
      </section>
      <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
        <h2 className="text-lg font-semibold text-text">What to expect</h2>
        <p>
          This is an early Android version. Sign in with your existing email and
          password, Google or GitHub. Notes and chat connect to the same account as the website.
        </p>
        <p>
          Markdown editing, local drafts, file uploads and chat are included.
          Files open through Android. Light, dark and system themes match the website.
          Rich editing, calendar and quizzes are not yet included. An internet connection is
          needed to load and sync your work.
        </p>
      </div>
      <Link
        href="/notes"
        className="text-sm font-semibold text-primary-600 dark:text-primary-300 underline underline-offset-4"
      >
        Continue on the website
      </Link>
    </main>
  );
}
