import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  transpilePackages: ["@evergreen-names/client"],
  partialPrefetching: true,
  // One app, three hosts: evergreennfts.space (story), app. (the app), docs. (the guide).
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "app.evergreennfts.space" }], destination: "/app" },
        { source: "/", has: [{ type: "host", value: "docs.evergreennfts.space" }], destination: "/docs" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      { source: "/:path*", has: [{ type: "host", value: "www.evergreennfts.space" }], destination: "https://evergreennfts.space/:path*", permanent: true },
      { source: "/app", has: [{ type: "host", value: "evergreennfts.space" }], destination: "https://app.evergreennfts.space/", permanent: false },
      { source: "/docs", has: [{ type: "host", value: "evergreennfts.space" }], destination: "https://docs.evergreennfts.space/", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
