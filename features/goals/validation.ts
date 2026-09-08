import { z } from "zod";

import { MAX_GOAL_NAME_CHARACTERS } from "@/lib/config/75-soft";
import { HttpError } from "@/lib/http";
import { goalInputSchema, positiveAmountSchema } from "@/lib/validation";
import type { GoalCreateInput, GoalPatchInput } from "@/features/goals/types";
import type { GoalDTO } from "@/lib/types";

const MAX_GOAL_TARGET = 1_000_000;

export const goalPayloadSchema = goalInputSchema.superRefine(
  (value, context) => {
    const hasTarget =
      value.targetValue !== undefined && value.targetValue !== null;
    const hasUnit = value.unit !== undefined && value.unit !== null;

    if (hasTarget && value.targetValue! > MAX_GOAL_TARGET) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: MAX_GOAL_TARGET,
        type: "number",
        inclusive: true,
        path: ["targetValue"],
        message: `Target must be ${MAX_GOAL_TARGET} or less`,
      });
    }

    if (hasTarget !== hasUnit) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unit"],
        message: "A numeric target requires a unit",
      });
    }
  },
);

export const goalPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_GOAL_NAME_CHARACTERS),
    targetValue: positiveAmountSchema.nullable(),
    unit: z.string().trim().min(1).max(40).nullable(),
    isPrivate: z.boolean(),
    active: z.literal(false),
  })
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one goal field is required",
  );

export function throwValidationError(error: z.ZodError): never {
  throw new HttpError(400, "VALIDATION_ERROR", "Request validation failed", {
    issues: error.issues.map((issue) => ({
      path: issue.path.map((part) => String(part)),
      message: issue.message,
    })),
  });
}

export function parseGoalPayload(value: unknown): GoalCreateInput {
  const parsed = goalPayloadSchema.safeParse(value);
  if (!parsed.success) {
    throwValidationError(parsed.error);
  }

  return {
    name: parsed.data.name,
    targetValue: parsed.data.targetValue ?? null,
    unit: parsed.data.unit ?? null,
    isPrivate: parsed.data.isPrivate ?? false,
    templateId: parsed.data.templateId ?? null,
  };
}

export function parseGoalPatch(value: unknown): GoalPatchInput {
  const parsed = goalPatchSchema.safeParse(value);
  if (!parsed.success) {
    throwValidationError(parsed.error);
  }

  return parsed.data;
}

export function mergeGoalPatch(
  current: GoalDTO,
  patch: GoalPatchInput,
): GoalCreateInput {
  return parseGoalPayload({
    name: patch.name ?? current.name,
    targetValue:
      Object.prototype.hasOwnProperty.call(patch, "targetValue") &&
      patch.targetValue !== undefined
        ? patch.targetValue
        : current.targetValue,
    unit:
      Object.prototype.hasOwnProperty.call(patch, "unit") &&
      patch.unit !== undefined
        ? patch.unit
        : current.unit,
    isPrivate: patch.isPrivate ?? current.isPrivate,
    templateId: current.templateId,
  });
}

export function parseGoalId(value: string): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "The goal id must be a UUID");
  }

  return parsed.data;
}
