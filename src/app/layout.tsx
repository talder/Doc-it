import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CopyToastProvider } from "@/components/CopyToast";
import CrashReporter from "@/components/CrashReporter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doc-it",
  description: "A simple markdown documentation editor",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <CopyToastProvider>
            <CrashReporter />
            {children}
          </CopyToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
