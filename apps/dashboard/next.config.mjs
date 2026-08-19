/** @type {import('next').NextConfig} */
const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'",
  },
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/icon.svg",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/_expo/:path*",
          destination: "/app/_expo/:path*",
        },
        {
          source: "/assets/:path*",
          destination: "/app/assets/:path*",
        },
        {
          source: "/app",
          destination: "/app/index.html",
        },
        {
          source: "/app/:path*",
          has: [
            {
              type: "header",
              key: "accept",
              value: ".*text/html.*",
            },
          ],
          destination: "/app/index.html",
        },
      ],
    };
  },
};

export default nextConfig;
