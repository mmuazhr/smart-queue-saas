import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SWRegistration } from "@/components/shared/SWRegistration";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "QueLess — No More Waiting in Line",
    template: "%s | QueLess",
  },
  description:
    "Digital queue and ordering system for food stalls, food trucks, and small vendors. Scan, order, pay, and get notified — no app install needed.",
  keywords: [
    "queue management",
    "food ordering",
    "QR code order",
    "food truck",
    "smart queue",
    "Malaysia",
  ],
  authors: [{ name: "QueLess" }],
  openGraph: {
    type: "website",
    locale: "en_MY",
    siteName: "QueLess",
    title: "QueLess — No More Waiting in Line",
    description:
      "Digital queue and ordering system for food stalls. Scan, order, pay, and get notified.",
  },
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

import { ThemeProvider } from "@/components/theme/ThemeProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <div className="gradient-bg min-h-screen">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}
