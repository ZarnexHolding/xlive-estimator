import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Where background AI analysis runs: a Netlify Background Function when built on Netlify
    // (which sets NETLIFY=true during builds), otherwise inside the app process after the response.
    ANALYSIS_RUNNER: process.env.ANALYSIS_RUNNER ?? (process.env.NETLIFY === "true" ? "netlify" : "inline"),
  },
  cacheComponents: true,
  partialPrefetching: true,
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
