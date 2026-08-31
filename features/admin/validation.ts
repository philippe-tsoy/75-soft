import { z } from "zod";

import { isoDateSchema } from "@/lib/validation";

export const ADMIN_REASON_MAX_CHARACTERS = 500;

export const adminUserIdSchema = z.string().uuid();

export const adminInvalidationInputSchema = z.object({
  localDate: isoDateSchema,
  reason: z
    .string()
    .trim()
    .max(ADMIN_REASON_MAX_CHARACTERS)
    .nullable()
    .optional(),
});

export type ParsedAdminInvalidationInput = z.infer<
  typeof adminInvalidationInputSchema
>;

export function normalizeAdminReason(
  reason: string | null | undefined,
): string | null {
  const normalized = reason?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}
