import type { Metadata } from "next";

// Noindex all private app routes — these should never appear in search results
export const metadata: Metadata = {
  title: "Settings",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};
