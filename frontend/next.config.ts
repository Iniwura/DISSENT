import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // The repository root is the workspace root. This prevents Next from
  // selecting the unrelated lockfile one directory above the repository.
  turbopack: {
    root: process.cwd().endsWith("/frontend") || process.cwd().endsWith("\\frontend")
      ? process.cwd().replace(/[\\/]frontend$/, "")
      : process.cwd(),
  },
};

export default nextConfig;
