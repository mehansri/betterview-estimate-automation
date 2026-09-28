/** @type {import('next').NextConfig} */
const API_PROXY_TARGET =
  process.env.API_PROXY_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  // /api/* is proxied by app/api/[...path]/route.ts, which adds the API token
  // server-side (a rewrite cannot). Only the public health check is rewritten.
  async rewrites() {
    return [
      {
        source: "/health",
        destination: `${API_PROXY_TARGET}/health`,
      },
    ];
  },
};

module.exports = nextConfig;
