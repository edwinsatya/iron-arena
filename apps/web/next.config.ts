import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';

function buildId(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@neonfist/sim', '@neonfist/netcode', '@neonfist/shared'],
  env: {
    // Both players must run the same simulation; the lobby compares this (PLAN §4.4 rule 7).
    NEXT_PUBLIC_SIM_VERSION: process.env.NEXT_PUBLIC_SIM_VERSION ?? buildId(),
  },
};

export default nextConfig;
