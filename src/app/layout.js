import "./globals.css";

export const metadata = {
    title: "SocsBoard",
    description: "AI-enhanced study & learning hub",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className="font-sans antialiased bg-background text-text">
                {children}
            </body>
        </html>
    );
}
