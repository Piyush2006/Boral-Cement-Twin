import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  /**
   * Static export.
   *
   * The deployment target serves the built files directly from `out/` behind
   * nginx (SSR off), so `next build` must emit a static site. The application
   * is entirely client-side — Leaflet and React Three Fiber are loaded with
   * `ssr: false`, and there are no server actions, route handlers or dynamic
   * routes — so nothing is lost by exporting.
   */
  output: "export",

  reactStrictMode: true,
  transpilePackages: ["three"],

  // The image optimiser needs a server; the app uses plain <img> tags anyway.
  images: { unoptimized: true },

  // Pin the workspace root so the lockfile outside the repo is not picked up.
  turbopack: { root: __dirname },

  // Do not auto-generate AGENTS.md/CLAUDE.md over the project's own docs.
  agentRules: false,
}

export default nextConfig
