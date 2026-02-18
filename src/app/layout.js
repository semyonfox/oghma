import "./globals.css";

export const metadata = {
    title: "SocsBoard",
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
                {children}
            </body>
        </html>
    );
}
