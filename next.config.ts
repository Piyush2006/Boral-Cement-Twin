import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  // Pin the workspace root so the lockfile outside the repo is not picked up.
  turbopack: { root: __dirname },
  // Do not auto-generate AGENTS.md/CLAUDE.md over the project's own docs.
  agentRules: false,
}

export default nextConfig
