import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface DatabaseTestConfig {
  url: string;
  serviceRoleKey: string;
  missing: string[];
}

const readEnv = (...names: string[]): string =>
  names.map((name) => process.env[name]?.trim()).find(Boolean) ?? "";

export const databaseTestConfig: DatabaseTestConfig = {
  url: readEnv("W8_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  serviceRoleKey: readEnv(
    "W8_DB_SERVICE_ROLE_KEY",
    "W8_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ),
  missing: [],
};

databaseTestConfig.missing = [
  !databaseTestConfig.url
    ? "W8_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)"
    : "",
  !databaseTestConfig.serviceRoleKey
    ? "W8_DB_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)"
    : "",
].filter(Boolean);

export const databaseConfigurationMessage =
  databaseTestConfig.missing.length === 0
    ? ""
    : `[W8 database] Live migration/RPC checks skipped. Configure ${databaseTestConfig.missing.join(
        ", ",
      )}. Static migration checks still run; service-role access is used only for schema inspection.`;

if (databaseConfigurationMessage) {
  console.warn(databaseConfigurationMessage);
}

export function createDatabaseClient(): SupabaseClient {
  if (databaseTestConfig.missing.length > 0) {
    throw new Error(databaseConfigurationMessage);
  }

  return createClient(
    databaseTestConfig.url,
    databaseTestConfig.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
