import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // native addon — don't bundle it, load from node_modules at runtime
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
