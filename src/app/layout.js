import { DM_Sans, Source_Serif_4 } from "next/font/google";
import "katex/dist/katex.min.css";
import I18nRootProvider from "@/components/providers/I18nRootProvider";
import ThemeProvider from "@/components/providers/ThemeProvider";
import PomodoroIntegration from "@/components/PomodoroIntegration";
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
  title: {
    default: "OghmaNotes",
    template: "%s | OghmaNotes",
  },
  description:
    "AI-enhanced study platform with semantic notes, RAG chat, adaptive quizzes, and Canvas LMS sync. Built for university students.",
  metadataBase: new URL("https://oghmanotes.ie"),
  openGraph: {
    title: "OghmaNotes",
    description:
      "AI-enhanced study platform with semantic notes, RAG chat, and adaptive quizzes.",
    url: "https://oghmanotes.ie",
    siteName: "OghmaNotes",
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
    description: "AI-enhanced study platform for students.",
    images: ["/notes-screenshot.png"],
  },
};

// static script to apply theme class before first paint (prevents FOUC)
// safe: hardcoded string, no user input
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('ogma-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){}})()`;

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
      </head>
      <body className="font-sans antialiased bg-background text-text">
        <I18nRootProvider>
          <ThemeProvider>
            <PomodoroIntegration />
            {children}
          </ThemeProvider>
        </I18nRootProvider>
      </body>
    </html>
  );
}
