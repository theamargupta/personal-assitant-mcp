import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/app/api/mcp': ['./widgets/**/*.html'],
  },
};

export default nextConfig;
