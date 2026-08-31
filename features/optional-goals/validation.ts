import { z } from "zod";

import { MAX_OPTIONAL_GOAL_NAME_CHARACTERS } from "@/lib/config/75-soft";
import { HttpError } from "@/lib/http";
import {
  isoDateSchema,
  operationIdSchema,
  optionalGoalInputSchema,
  positiveAmountSchema,
} from "@/lib/validation";
import type {
  OptionalGoalCreateInput,
  OptionalGoalLogInput,
  OptionalGoalPatchInput,
} from "@/features/optional-goals/types";
import type { OptionalGoalDTO } from "@/lib/types";

const MAX_OPTIONAL_GOAL_TARGET = 1_000_000;

export const optionalGoalPayloadSchema = optionalGoalInputSchema.superRefine(
  (value, context) => {
    const hasTarget =
      value.targetValue !== undefined && value.targetValue !== null;
    const hasUnit = value.unit !== undefined && value.unit !== null;

    if (hasTarget && value.targetValue! > MAX_OPTIONAL_GOAL_TARGET) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: MAX_OPTIONAL_GOAL_TARGET,
        type: "number",
        inclusive: true,
        path: ["targetValue"],
        message: `Target must be ${MAX_OPTIONAL_GOAL_TARGET} or less`,
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

export const optionalGoalPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_OPTIONAL_GOAL_NAME_CHARACTERS),
    targetValue: positiveAmountSchema.nullable(),
    unit: z.string().trim().min(1).max(40).nullable(),
    active: z.literal(false),
  })
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one goal field is required",
  );

export const optionalGoalLogSchema = z
  .object({
    localDate: isoDateSchema,
    value: positiveAmountSchema.nullable().optional(),
    completed: z.boolean().nullable().optional(),
    clientOperationId: operationIdSchema,
  })
  .superRefine((value, context) => {
    const hasValue = value.value !== undefined && value.value !== null;
    const hasCompleted =
      value.completed !== undefined && value.completed !== null;

    if (hasValue === hasCompleted) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either a numeric value or a checkbox state",
      });
    }
  });

export function throwValidationError(error: z.ZodError): never {
  throw new HttpError(400, "VALIDATION_ERROR", "Request validation failed", {
    issues: error.issues.map((issue) => ({
      path: issue.path.map((part) => String(part)),
      message: issue.message,
    })),
  });
}

export function parseOptionalGoalPayload(
  value: unknown,
): OptionalGoalCreateInput {
  const parsed = optionalGoalPayloadSchema.safeParse(value);
  if (!parsed.success) {
    throwValidationError(parsed.error);
  }

  return {
    name: parsed.data.name,
    targetValue: parsed.data.targetValue ?? null,
    unit: parsed.data.unit ?? null,
  };
}

export function parseOptionalGoalPatch(value: unknown): OptionalGoalPatchInput {
  const parsed = optionalGoalPatchSchema.safeParse(value);
  if (!parsed.success) {
    throwValidationError(parsed.error);
  }

  return parsed.data;
}

export function mergeOptionalGoalPatch(
  current: OptionalGoalDTO,
  patch: OptionalGoalPatchInput,
): OptionalGoalCreateInput {
  return parseOptionalGoalPayload({
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
  });
}

export function parseOptionalGoalLog(value: unknown): OptionalGoalLogInput {
  const parsed = optionalGoalLogSchema.safeParse(value);
  if (!parsed.success) {
    throwValidationError(parsed.error);
  }

  return parsed.data;
}

export function parseOptionalGoalId(value: string): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "The optional goal id must be a UUID",
    );
  }

  return parsed.data;
}
