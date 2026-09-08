import { z } from "zod";

import { HttpError } from "@/lib/http";
import { positiveAmountSchema } from "@/lib/validation";

const MAX_GOAL_TEMPLATE_TARGET = 1_000_000;

export const goalTemplatePayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    targetValue: positiveAmountSchema.max(MAX_GOAL_TEMPLATE_TARGET).nullable(),
    unit: z.string().trim().min(1).max(40).nullable(),
  })
  .superRefine((value, context) => {
    const hasTarget = value.targetValue !== null;
    const hasUnit = value.unit !== null;

    if (hasTarget !== hasUnit) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unit"],
        message: "A numeric target requires a unit",
      });
    }
  });

export const goalTemplatePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    targetValue: positiveAmountSchema.max(MAX_GOAL_TEMPLATE_TARGET).nullable(),
    unit: z.string().trim().min(1).max(40).nullable(),
    active: z.boolean(),
  })
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one template field is required",
  );

function throwValidationError(error: z.ZodError): never {
  throw new HttpError(400, "VALIDATION_ERROR", "Request validation failed", {
    issues: error.issues.map((issue) => ({
      path: issue.path.map((part) => String(part)),
      message: issue.message,
    })),
  });
}

export function parseGoalTemplatePayload(value: unknown) {
  const parsed = goalTemplatePayloadSchema.safeParse(value);
  if (!parsed.success) {
    throwValidationError(parsed.error);
  }

  return parsed.data;
}

export function parseGoalTemplatePatch(value: unknown) {
  const parsed = goalTemplatePatchSchema.safeParse(value);
  if (!parsed.success) {
    throwValidationError(parsed.error);
  }

  return parsed.data;
}

export function parseGoalTemplateId(value: string): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "The template id must be a UUID",
    );
  }

  return parsed.data;
}
