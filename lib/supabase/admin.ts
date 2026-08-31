import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/config/env";
import type { Database } from "@/lib/supabase/database.types";

let adminClient: SupabaseClient<Database> | undefined;

export function createSupabaseAdminClient(): SupabaseClient<Database> {
  if (!adminClient) {
    const env = getServerEnv();
    adminClient = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return adminClient;
}
