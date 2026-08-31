import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  INVITE_INTENT_SECRET: z.string().min(32),
});

function parseEnv<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Invalid environment configuration: ${fields.join(", ")}`);
  }

  return result.data;
}

export function getPublicEnv() {
  return parseEnv(publicEnvSchema);
}

export function getServerEnv() {
  return parseEnv(serverEnvSchema);
}
