import type { Metadata } from "next";
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
  title: "SlugSwap Control Deck",
  description: "Operations dashboard for SlugSwap",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSerif.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
