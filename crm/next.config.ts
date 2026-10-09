import type { NextConfig } from "next";

// Every CRM page is per-user and live, so we use the classic dynamic rendering
// model rather than Cache Components. Keep it simple.
const nextConfig: NextConfig = {
  cacheComponents: false,
  devIndicators: false,
  // The online test version builds on a small free machine: there the type check is skipped (it already
  // ran before the code was committed: npm run typecheck).
  typescript: { ignoreBuildErrors: process.env.LIGHT_BUILD === "1" },
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
