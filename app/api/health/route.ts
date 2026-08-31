import { ok } from "@/lib/http";

// Read at request time so the response reflects the deployment environment
// rather than values captured during the build.
export const dynamic = "force-dynamic";

const REQUIRED_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INVITE_INTENT_SECRET",
] as const;

// Presence only. Values are never returned.
function readConfiguration() {
  const present = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    INVITE_INTENT_SECRET: Boolean(process.env.INVITE_INTENT_SECRET),
    NEXT_PUBLIC_APP_URL: Boolean(process.env.NEXT_PUBLIC_APP_URL),
  };

  return {
    present,
    missing: REQUIRED_VARIABLES.filter((name) => !present[name]),
    inviteSecretMeetsLength:
      (process.env.INVITE_INTENT_SECRET?.length ?? 0) >= 32,
  };
}

export function GET() {
  const configuration = readConfiguration();

  return ok({
    service: "75-soft",
    status:
      configuration.missing.length === 0 &&
      configuration.inviteSecretMeetsLength
        ? "ok"
        : "misconfigured",
    configuration,
  });
}
