import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/mcp': ['./widgets/**/*'],
  },
};

export default nextConfig;
