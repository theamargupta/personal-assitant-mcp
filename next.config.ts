import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/app/api/mcp': [
      './widgets/**/*.html',
      './node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js',
    ],
  },
};

export default nextConfig;
