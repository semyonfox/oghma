import { DM_Sans, Source_Serif_4 } from "next/font/google";
import I18nRootProvider from "@/components/providers/I18nRootProvider";
import ThemeProvider from "@/components/providers/ThemeProvider";
import CanvasIntegration from "@/components/CanvasIntegration";
import PomodoroIntegration from "@/components/PomodoroIntegration";
import "./globals.css";
// Import react-pdf styles globally so they're available for all PDF viewers
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

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
    title: "OghmaNotes",
    description: "AI-enhanced study & learning hub",
};

// static script to apply theme class before first paint (prevents FOUC)
// safe: hardcoded string, no user input
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('ogma-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){}})()`;

export default function RootLayout({ children }) {
    return (
        <html lang="en" className={`${dmSans.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
            <head>
                {/* theme init script uses hardcoded string only, no user input - safe */}
                <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
            </head>
            <body className="font-sans antialiased bg-background text-text">
                <I18nRootProvider>
                    <ThemeProvider>
                        <CanvasIntegration />
                        <PomodoroIntegration />
                        {children}
                    </ThemeProvider>
                </I18nRootProvider>
            </body>
        </html>
    );
}
