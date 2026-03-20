import I18nRootProvider from "@/components/providers/I18nRootProvider";
import CanvasIntegration from "@/components/CanvasIntegration";
import "./globals.css";
// Import react-pdf styles globally so they're available for all PDF viewers
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

export const metadata = {
    title: "OghmaNotes",
    description: "AI-enhanced study & learning hub",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                {/* Accessibility: Preconnect to external resources if any */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            </head>
            <body className="font-sans antialiased bg-background text-text">
                <I18nRootProvider>
                    <CanvasIntegration />
                    {children}
                </I18nRootProvider>
            </body>
        </html>
    );
}
