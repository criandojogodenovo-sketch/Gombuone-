import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GOMBUONE — Campanhas e Oportunidades Locais",
    template: "%s | GOMBUONE",
  },
  description:
    "Plataforma de campanhas e oportunidades locais. Gestão administrativa de oportunidades com upload seguro de imagens.",
  keywords: ["GOMBUONE", "campanhas", "oportunidades", "Angola", "Luanda"],
  openGraph: {
    title: "GOMBUONE",
    description: "Campanhas e oportunidades locais",
    siteName: "GOMBUONE",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-background text-foreground`}
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
