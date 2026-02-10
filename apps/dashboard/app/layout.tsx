import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SlugSwap Dashboard",
  description: "Operations dashboard for SlugSwap",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          background: "#f7f8fb",
          color: "#111827",
        }}
      >
        {children}
      </body>
    </html>
  );
}
