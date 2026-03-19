import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * HTML shell for the Expo web build (served by Next.js as /app and /app/*).
 *
 * Because Next.js rewrites those routes to this static HTML file, the
 * Next.js RootLayout — and therefore its <SpeedInsights /> — never runs for
 * Expo web visitors. This file is the right place to inject the Vercel Speed
 * Insights beacon so the user-facing app is instrumented too.
 *
 * /_vercel/insights/script.js is served by Vercel's edge for every deployment,
 * so the path resolves correctly whether the page is loaded from /app or /app/*.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/*
         * Expo Router requires this to make ScrollView behave correctly on web.
         * It resets body/html margins and sets height to 100%.
         */}
        <ScrollViewStyleReset />

        {/* Vercel Speed Insights — mirrors what <SpeedInsights /> does in the Next shell */}
        <script defer src="/_vercel/insights/script.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
