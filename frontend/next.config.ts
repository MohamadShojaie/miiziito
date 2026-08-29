import type { NextConfig } from "next";

const isProdBuild = process.env.NEXT_BUILD === "1";
const apiPort =
  process.env.MIIZIITO_API_PORT || process.env.LUMIERE_API_PORT || "8787";

const nextConfig: NextConfig = {
  ...(isProdBuild ? { output: "export" as const } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  async rewrites() {
    if (isProdBuild) return [];
    // Proxy /api/* to local Python API (same passwords as data/secret.php)
    return [
      {
        source: "/api/:path*",
        destination: `http://127.0.0.1:${apiPort}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `http://127.0.0.1:${apiPort}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
