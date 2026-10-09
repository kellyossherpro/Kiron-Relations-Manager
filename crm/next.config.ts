import type { NextConfig } from "next";

// Every CRM page is per-user and live, so we use the classic dynamic rendering
// model rather than Cache Components. Keep it simple.
const nextConfig: NextConfig = {
  cacheComponents: false,
  devIndicators: false,
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
