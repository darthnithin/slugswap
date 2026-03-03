/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
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
