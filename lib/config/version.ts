const commitSha = process.env.APP_COMMIT_SHA ?? "dev";

export const APP_VERSION = commitSha === "dev" ? "dev" : commitSha.slice(0, 7);
