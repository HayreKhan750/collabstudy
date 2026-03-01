import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.collabstudy.com";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),

  title: {
    default: "CollabStudy — AI-Powered Academic Collaboration",
    template: "%s | CollabStudy",
  },
  description:
    "Real-time academic collaboration platform with AI-powered chat summaries, semantic search, smart notifications, and voice/video calls. Study smarter, together.",

  keywords: [
    "academic collaboration",
    "study platform",
    "AI study assistant",
    "real-time chat",
    "student workspace",
    "collaborative learning",
  ],

  authors: [{ name: "CollabStudy" }],
  creator: "CollabStudy",

  // Canonical URL
  alternates: {
    canonical: "/",
  },

  // OpenGraph
  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    siteName: "CollabStudy",
    title: "CollabStudy — AI-Powered Academic Collaboration",
    description:
      "Real-time academic collaboration platform with AI-powered chat summaries, semantic search, and smart notifications.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "CollabStudy — AI-Powered Academic Collaboration",
      },
    ],
  },

  // Twitter / X card
  twitter: {
    card: "summary_large_image",
    title: "CollabStudy — AI-Powered Academic Collaboration",
    description:
      "Real-time academic collaboration platform with AI-powered chat summaries, semantic search, and smart notifications.",
    images: ["/og-image.png"],
    creator: "@collabstudy",
  },

  // Robots — noindex private app routes via per-page metadata; default to index
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // App icons
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* The Radiant Abyss — cyber-purple deep space background */}
        <div className="fixed inset-0 z-[-1] pointer-events-none bg-[#FAFAFA] dark:bg-[#030014] dark:[background-image:radial-gradient(ellipse_at_top,_#2e1a6566_0%,_#030014_60%),radial-gradient(ellipse_at_bottom-right,_#1a0a3a33_0%,_transparent_70%)]" />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
