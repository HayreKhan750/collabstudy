import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for optimized Docker builds — copies only the necessary files
  // into a self-contained .next/standalone directory.
  output: "standalone",
};

export default nextConfig;
