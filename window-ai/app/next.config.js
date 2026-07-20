/** @type {import('next').NextConfig} */
const API_PROXY_TARGET =
  process.env.API_PROXY_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  // Proxy API calls through Next so the browser uses same-origin requests.
  // Avoids CORS / wrong-host / mixed-content failures when quoting from the UI.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${API_PROXY_TARGET}/health`,
      },
    ];
  },
};

module.exports = nextConfig;
