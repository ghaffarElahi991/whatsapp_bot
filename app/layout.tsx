import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mayfair WhatsApp Campaigns",
  description: "Import, validate, send, and track Mayfair Car Parts WhatsApp campaigns.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body className="antialiased">{children}</body>
    </html>
  );
}
