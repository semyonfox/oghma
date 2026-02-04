import "./globals.css";
import { Roboto } from 'next/font/google';

const roboto = Roboto({
    weight: ['400', '700'],
    subsets: ['latin'],
    display: 'swap',
});

export const metadata = {
  title: "SocsBoard",
  description: "A Social Platform for Society-Student Interaction",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={roboto.className}>
        {children}
      </body>
    </html>
  );
}
