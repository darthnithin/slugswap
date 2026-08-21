import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Instrument_Serif, JetBrains_Mono, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://slugswap.vercel.app"),
  title: "SlugSwap | Campus life, less scattered.",
  description: "Dining, rooms, maps, GET, and point sharing—made easier for UC Santa Cruz students.",
  openGraph: {
    title: "SlugSwap | Campus life, less scattered.",
    description: "Dining, rooms, maps, GET, and point sharing—made easier for UC Santa Cruz students.",
    url: "/",
    siteName: "SlugSwap",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "SlugSwap campus tools for dining, study rooms, campus maps, and GET",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SlugSwap | Campus life, less scattered.",
    description: "Dining, rooms, maps, GET, and point sharing—made easier for UC Santa Cruz students.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const isVercelDeployment = process.env.VERCEL === "1";

  return (
    <html lang="en">
      <body
        className={`${instrumentSerif.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
      >
        {children}
        {isVercelDeployment ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
