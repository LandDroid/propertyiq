import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the frontend's auth and dashboard requests pointed at the API in local
  // development. Deployments should set NEXT_PUBLIC_API_URL to the deployed API.
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1",
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
