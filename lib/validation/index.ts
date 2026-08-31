import { z } from "zod";

import {
  MAX_COMMENT_CHARACTERS,
  MAX_DISPLAY_NAME_CHARACTERS,
  MAX_NOTE_CHARACTERS,
  MAX_OPTIONAL_GOAL_NAME_CHARACTERS,
  MAX_REACTION_PALETTE_ENTRIES,
  MAX_WATER_CONTAINER_LABEL_CHARACTERS,
  REQUIRED_GOAL_KEYS,
} from "@/lib/config/75-soft";
import { isValidIANATimezone, isValidISODate } from "@/lib/dates";

export function graphemeLength(value: string): number {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
    ).length;
  }

  return Array.from(value).length;
}

export function isSingleEmoji(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || graphemeLength(normalized) !== 1) {
    return false;
  }

  return /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}]/u.test(
    normalized,
  );
}

export const requiredGoalKeySchema = z.enum(REQUIRED_GOAL_KEYS);

export const isoDateSchema = z
  .string()
  .refine(isValidISODate, "Use a valid YYYY-MM-DD date");

export const timezoneSchema = z
  .string()
  .min(1)
  .refine(isValidIANATimezone, "Use a valid IANA timezone");

export const operationIdSchema = z.string().uuid();

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required")
  .max(MAX_DISPLAY_NAME_CHARACTERS);

export const commentBodySchema = z
  .string()
  .trim()
  .min(1, "Comment cannot be empty")
  .refine(
    (value) => graphemeLength(value) <= MAX_COMMENT_CHARACTERS,
    `Comments must be ${MAX_COMMENT_CHARACTERS} characters or fewer`,
  );

export const noteSchema = z
  .string()
  .trim()
  .max(MAX_NOTE_CHARACTERS)
  .nullable()
  .optional();

export const positiveAmountSchema = z
  .number()
  .finite()
  .positive()
  .max(1_000_000);

export const waterAmountSchema = z.object({
  amount: positiveAmountSchema,
  unit: z.enum(["ml", "l"]),
});

export const containerInputSchema = z.object({
  label: z.string().trim().min(1).max(MAX_WATER_CONTAINER_LABEL_CHARACTERS),
  volumeMl: z.number().int().positive().max(100_000),
});

export const optionalGoalInputSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_OPTIONAL_GOAL_NAME_CHARACTERS),
    targetValue: z.number().finite().positive().nullable().optional(),
    unit: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.targetValue !== null && value.targetValue !== undefined) {
      if (!value.unit) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["unit"],
          message: "A unit is required for a numeric target",
        });
      }
    }
  });

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  timezone: timezoneSchema.optional(),
});

export const reactionPaletteSchema = z.object({
  emoji: z
    .array(z.string().trim().refine(isSingleEmoji, "Use one emoji per entry"))
    .min(1)
    .max(MAX_REACTION_PALETTE_ENTRIES)
    .refine(
      (entries) => new Set(entries).size === entries.length,
      "Palette entries must be unique",
    ),
});

export const postGoalInputSchema = z
  .union([
    z.object({
      kind: z.literal("required"),
      key: requiredGoalKeySchema,
      amount: positiveAmountSchema.optional(),
      unit: z.enum(["minutes", "ml", "l", "pages"]).optional(),
      containerId: z.string().uuid().optional(),
    }),
    z
      .object({
        kind: z.literal("optional"),
        optionalGoalId: z.string().uuid(),
        value: z.number().finite().positive().nullable().optional(),
        completed: z.boolean().nullable().optional(),
      })
      .superRefine((value, context) => {
        const hasValue = value.value !== null && value.value !== undefined;
        const hasCompleted =
          value.completed !== null && value.completed !== undefined;

        if (hasValue === hasCompleted) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide either a numeric value or a checkbox state",
          });
        }
      }),
  ])
  .array()
  .min(1, "Select at least one goal")
  .superRefine((entries, context) => {
    const seen = new Set<string>();

    entries.forEach((entry, index) => {
      const identity =
        entry.kind === "required"
          ? `required:${entry.key}`
          : `optional:${entry.optionalGoalId}`;

      if (seen.has(identity)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: "A post cannot select the same goal twice",
        });
      }

      seen.add(identity);
    });
  });

export function normalizeWaterAmount(amount: number, unit: "ml" | "l"): number {
  const normalized = unit === "l" ? amount * 1_000 : amount;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error("Water amount must resolve to a positive whole ml value");
  }

  return normalized;
}
