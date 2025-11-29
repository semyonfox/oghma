import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import BootstrapClient from "@/components/bootstrapClient";
import { Roboto } from 'next/font/google';

const roboto = Roboto({
    weight: ['400', '700'], // regular and bold
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
        <BootstrapClient />
        {children}
      </body>
    </html>
  );
}
