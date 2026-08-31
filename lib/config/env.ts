import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  INVITE_INTENT_SECRET: z.string().min(32),
});

function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  values: Record<string, string | undefined>,
): z.infer<T> {
  const result = schema.safeParse(values);

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Invalid environment configuration: ${fields.join(", ")}`);
  }

  return result.data;
}

export function getPublicEnv() {
  // Static `process.env.X` access is required so Next.js inlines NEXT_PUBLIC_*
  // values. `safeParse(process.env)` is a dynamic lookup and can be empty in
  // production bundles, which crashes Server Components as React error #441.
  return parseEnv(publicEnvSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}

export function getServerEnv() {
  return parseEnv(serverEnvSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    INVITE_INTENT_SECRET: process.env.INVITE_INTENT_SECRET,
  });
}
