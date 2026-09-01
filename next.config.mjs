import { execSync } from "node:child_process";

// Vercel already exposes the deployed commit as an env var at build time; a
// local `next dev`/`next build` has no such var, so fall back to reading the
// checked-out repo directly. Either path re-resolves on every process start,
// so the value tracks whatever commit is currently checked out.
function resolveCommitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }

  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    APP_COMMIT_SHA: resolveCommitSha(),
  },
};

export default nextConfig;
