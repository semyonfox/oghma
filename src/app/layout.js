import I18nRootProvider from "@/components/providers/I18nRootProvider";
import ThemeProvider from "@/components/providers/ThemeProvider";
import CanvasIntegration from "@/components/CanvasIntegration";
import "./globals.css";
// Import react-pdf styles globally so they're available for all PDF viewers
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

export const metadata = {
    title: "OghmaNotes",
    description: "AI-enhanced study & learning hub",
};

// static script to apply theme class before first paint (prevents FOUC)
// safe: hardcoded string, no user input
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('ogma-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){}})()`;

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            </head>
            <body className="font-sans antialiased bg-background text-text">
                <I18nRootProvider>
                    <ThemeProvider>
                        <CanvasIntegration />
                        {children}
                    </ThemeProvider>
                </I18nRootProvider>
            </body>
        </html>
    );
}
