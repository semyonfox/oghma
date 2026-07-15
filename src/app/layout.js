import { DM_Sans, Source_Serif_4 } from "next/font/google";
import I18nRootProvider from "@/components/providers/i18n-root-provider";
import ThemeProvider from "@/components/providers/theme-provider";
import PomodoroTimerController from "@/components/pomodoro/pomodoro-timer-controller";
import GlobalSearchRoot from "@/components/search/global-search-root";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-source-serif",
});

export const metadata = {
  applicationName: "OghmaNotes",
  title: {
    default: "OghmaNotes",
    template: "%s | OghmaNotes",
  },
  description:
    "AI-enhanced study platform for university students with semantic notes, cited RAG chat, adaptive quizzes, spaced repetition, PDF ingestion, and Canvas LMS sync.",
  metadataBase: new URL("https://oghmanotes.ie"),
  alternates: {
    canonical: "/",
  },
  keywords: [
    "OghmaNotes",
    "AI study platform",
    "RAG chat",
    "student notes",
    "semantic search",
    "Canvas LMS",
    "adaptive quizzes",
    "spaced repetition",
    "PDF study assistant",
  ],
  authors: [{ name: "OghmaNotes Team", url: "https://oghmanotes.ie/about" }],
  creator: "OghmaNotes",
  publisher: "OghmaNotes",
  category: "education",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "compact-info": "https://oghmanotes.ie/info.md",
    "llms-txt": "https://oghmanotes.ie/llms.txt",
    "llms-full": "https://oghmanotes.ie/llms-full.txt",
    "ai-profile": "https://oghmanotes.ie/ai.md",
    "agent-guide": "https://oghmanotes.ie/agents.md",
    "agent-api": "https://oghmanotes.ie/agent-api.json",
    "openapi": "https://oghmanotes.ie/openapi.json",
    "agent-registration": "https://oghmanotes.ie/auth.md",
  },
  openGraph: {
    title: "OghmaNotes",
    description:
      "AI-enhanced study platform with semantic notes, cited RAG chat, Canvas sync, adaptive quizzes, and spaced repetition.",
    url: "https://oghmanotes.ie",
    siteName: "OghmaNotes",
    locale: "en_IE",
    type: "website",
    images: [
      {
        url: "/notes-screenshot.png",
        width: 1440,
        height: 900,
        alt: "OghmaNotes editor interface",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OghmaNotes",
    description:
      "AI-enhanced study platform for notes, PDFs, cited RAG chat, quizzes, flashcards, and Canvas sync.",
    images: ["/notes-screenshot.png"],
  },
};

// static script to apply theme class before first paint (prevents FOUC)
// safe: hardcoded string, no user input
const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )ogma-theme=([^;]+)/);var t=(m?decodeURIComponent(m[1]):null)||localStorage.getItem('ogma-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);var r=document.documentElement;r.classList.remove('dark','light');r.classList.add(d?'dark':'light')}catch(e){}})()`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${sourceSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* theme init script uses hardcoded string only, no user input - safe */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link
          rel="alternate"
          type="text/markdown"
          href="/info.md"
          title="OghmaNotes compact Markdown info"
        />
        <link
          rel="alternate"
          type="text/markdown"
          href="/ai.md"
          title="OghmaNotes full AI profile"
        />
        <link
          rel="alternate"
          type="text/plain"
          href="/llms.txt"
          title="OghmaNotes llms.txt"
        />
        <link
          rel="service-desc"
          type="application/json"
          href="/openapi.json"
          title="OghmaNotes OpenAPI"
        />
        <link
          rel="alternate"
          type="text/markdown"
          href="/auth.md"
          title="Agent-initiated new-user registration"
        />
        <link
          rel="sitemap"
          type="application/xml"
          href="/agent-sitemap.xml"
          title="OghmaNotes agent sitemap"
        />
      </head>
      <body className="font-sans antialiased bg-background text-text">
        <I18nRootProvider>
          <ThemeProvider>
            <PomodoroTimerController />
            <GlobalSearchRoot />
            {children}
          </ThemeProvider>
        </I18nRootProvider>
      </body>
    </html>
  );
}
