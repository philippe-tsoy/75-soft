import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "@/components/providers/query-provider";

import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "75 Soft",
  description: "A private group tracker for the 75 Soft challenge.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "75 Soft",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2f6b4f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
