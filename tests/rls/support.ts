import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AuthenticatedRole = "memberA" | "memberB" | "removedMember" | "admin";

interface AccountConfig {
  email: string;
  password: string;
  userId: string;
}

export interface RlsConfig {
  url: string;
  anonKey: string;
  accounts: Record<AuthenticatedRole, AccountConfig>;
  missing: string[];
}

export interface RlsContexts {
  anonymous: SupabaseClient;
  memberA: SupabaseClient;
  memberB: SupabaseClient;
  removedMember: SupabaseClient;
  admin: SupabaseClient;
}

const readEnv = (...names: string[]): string =>
  names.map((name) => process.env[name]?.trim()).find(Boolean) ?? "";

const envRoleName: Record<AuthenticatedRole, string> = {
  memberA: "MEMBER_A",
  memberB: "MEMBER_B",
  removedMember: "REMOVED_MEMBER",
  admin: "ADMIN",
};

const account = (role: AuthenticatedRole): AccountConfig => ({
  email: readEnv(
    `W8_RLS_${envRoleName[role]}_EMAIL`,
    `W8_RLS_${role.toUpperCase()}_EMAIL`,
  ),
  password: readEnv(
    `W8_RLS_${envRoleName[role]}_PASSWORD`,
    `W8_RLS_${role.toUpperCase()}_PASSWORD`,
  ),
  userId: readEnv(
    `W8_RLS_${envRoleName[role]}_ID`,
    `W8_RLS_${role.toUpperCase()}_ID`,
  ),
});

export const rlsConfig: RlsConfig = {
  url: readEnv("W8_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  anonKey: readEnv("W8_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  accounts: {
    memberA: account("memberA"),
    memberB: account("memberB"),
    removedMember: account("removedMember"),
    admin: account("admin"),
  },
  missing: [],
};

rlsConfig.missing = [
  !rlsConfig.url ? "W8_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)" : "",
  !rlsConfig.anonKey
    ? "W8_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)"
    : "",
  ...Object.entries(rlsConfig.accounts).flatMap(([role, values]) => [
    !values.email
      ? `W8_RLS_${envRoleName[role as AuthenticatedRole]}_EMAIL`
      : "",
    !values.password
      ? `W8_RLS_${envRoleName[role as AuthenticatedRole]}_PASSWORD`
      : "",
    !values.userId ? `W8_RLS_${envRoleName[role as AuthenticatedRole]}_ID` : "",
  ]),
].filter(Boolean);

export const rlsConfigurationMessage =
  rlsConfig.missing.length === 0
    ? ""
    : `[W8 RLS] Real authenticated matrix skipped. Configure ${rlsConfig.missing.join(
        ", ",
      )}. These tests intentionally do not replace authenticated RLS with service-role or mocked requests.`;

if (rlsConfigurationMessage) {
  console.warn(rlsConfigurationMessage);
}

export function createRlsClient(): SupabaseClient {
  if (!rlsConfig.url || !rlsConfig.anonKey) {
    throw new Error(
      "[W8 RLS] Cannot create a client without Supabase URL and anon key.",
    );
  }

  return createClient(rlsConfig.url, rlsConfig.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function signIn(role: AuthenticatedRole): Promise<SupabaseClient> {
  const client = createRlsClient();
  const credentials = rlsConfig.accounts[role];
  const { data, error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error || !data.user) {
    throw new Error(
      `[W8 RLS] Unable to authenticate ${role}. Check the configured test account and password.`,
    );
  }

  if (data.user.id !== credentials.userId) {
    throw new Error(
      `[W8 RLS] ${role} authenticated as an unexpected user. Check its configured ID.`,
    );
  }

  return client;
}

export async function createRlsContexts(): Promise<RlsContexts> {
  const [memberA, memberB, removedMember, admin] = await Promise.all([
    signIn("memberA"),
    signIn("memberB"),
    signIn("removedMember"),
    signIn("admin"),
  ]);

  return {
    anonymous: createRlsClient(),
    memberA,
    memberB,
    removedMember,
    admin,
  };
}

export async function closeRlsContexts(
  contexts: RlsContexts | undefined,
): Promise<void> {
  if (!contexts) {
    return;
  }

  await Promise.all(
    [
      contexts.memberA,
      contexts.memberB,
      contexts.removedMember,
      contexts.admin,
    ].map((client) => client.auth.signOut()),
  );
}

type RowFilter = readonly [column: string, value: string];

interface SelectOptions {
  allowDenied?: boolean;
}

export async function selectRows(
  client: SupabaseClient,
  table: string,
  columns = "id",
  filters: readonly RowFilter[] = [],
  options: SelectOptions = {},
): Promise<unknown[]> {
  let query = client.from(table).select(columns);

  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }

  const { data, error } = await query;
  if (error) {
    if (options.allowDenied && error.code === "42501") {
      return [];
    }

    throw new Error(
      `[W8 RLS] ${table} select failed (${error.code ?? "unknown"}). The real schema must be applied before the matrix can pass.`,
    );
  }

  return (data ?? []) as unknown[];
}

export async function invokeRpc(
  client: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(functionName, args);
  if (error) {
    throw new Error(
      `[W8 RLS] RPC ${functionName} failed (${error.code ?? "unknown"}). Apply the domain migrations and expose the documented RPC before running the matrix.`,
    );
  }

  return data;
}
