// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "G-SPAN Screen Network",
  description: "G-SPAN control plane for adaptive creative packages, screens, campaigns and proof-of-play.",
  applicationName: "G-SPAN Screen Network",
  metadataBase: new URL("https://signage-control-plane.vercel.app"),
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
