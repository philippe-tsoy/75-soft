import { z } from "zod";

import {
  CLIENT_OPERATION_ID_HEADER,
  requireClientOperationId,
} from "@/lib/idempotency";
import { HttpError } from "@/lib/http";
import {
  containerInputSchema,
  normalizeWaterAmount,
  operationIdSchema,
  signedAmountSchema,
} from "@/lib/validation";

import type {
  ContainerCreateInput,
  ContainerUpdateInput,
  DayAmountInput,
  DayEntryInput,
  DayContainerInput,
  GoalDoneToggleInput,
} from "./types";

export const dayAmountInputSchema = z
  .object({
    goalId: z.string().uuid(),
    amount: signedAmountSchema,
    unit: z.enum(["ml", "l"]).optional(),
    clientOperationId: operationIdSchema.optional(),
  })
  .strict();

export const dayContainerInputSchema = z
  .object({
    goalId: z.string().uuid(),
    containerId: z.string().uuid(),
    clientOperationId: operationIdSchema.optional(),
  })
  .strict();

export const dayEntryInputSchema = z.union([
  dayAmountInputSchema,
  dayContainerInputSchema,
]);

export const goalDoneToggleInputSchema = z
  .object({
    clientOperationId: operationIdSchema.optional(),
  })
  .strict();

export const containerPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(40).optional(),
    volumeMl: z.number().int().positive().max(100_000).optional(),
    sortOrder: z.number().int().min(0).max(2_000_000_000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.label !== undefined ||
      value.volumeMl !== undefined ||
      value.sortOrder !== undefined,
    "At least one container field is required",
  );

function validationError(message: string, details?: Record<string, unknown>) {
  return new HttpError(400, "VALIDATION_ERROR", message, details);
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw validationError("Request body must be valid JSON");
  }
}

function zodValidationError(message: string, error: z.ZodError): HttpError {
  return validationError(message, { issues: error.issues });
}

export function parseDayEntryInput(value: unknown): DayEntryInput {
  const parsed = dayEntryInputSchema.safeParse(value);
  if (!parsed.success) {
    throw zodValidationError("Invalid day entry", parsed.error);
  }

  return parsed.data as DayEntryInput;
}

export function parseGoalIdPathSegment(value: string): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw validationError("Goal must be a valid id");
  }

  return parsed.data;
}

export function parseGoalDoneToggleInput(
  value: unknown,
): z.infer<typeof goalDoneToggleInputSchema> {
  const parsed = goalDoneToggleInputSchema.safeParse(value);
  if (!parsed.success) {
    throw zodValidationError("Invalid goal toggle", parsed.error);
  }

  return parsed.data;
}

export function parseContainerCreateInput(
  value: unknown,
): ContainerCreateInput {
  const parsed = containerInputSchema.safeParse(value);
  if (!parsed.success) {
    throw zodValidationError("Invalid water container", parsed.error);
  }

  return parsed.data;
}

export function parseContainerUpdateInput(
  value: unknown,
): ContainerUpdateInput {
  const parsed = containerPatchSchema.safeParse(value);
  if (!parsed.success) {
    throw zodValidationError("Invalid water container update", parsed.error);
  }

  return parsed.data;
}

/**
 * The API contract carries the operation id in JSON. The shared retry
 * boundary also supports the header used by offline/retry clients.
 */
export function resolveClientOperationId(
  request: Request,
  bodyOperationId?: string,
): string {
  const headerValue = request.headers.get(CLIENT_OPERATION_ID_HEADER);
  const parsedHeader = headerValue
    ? operationIdSchema.safeParse(headerValue)
    : null;

  if (parsedHeader && !parsedHeader.success) {
    throw validationError(
      `A UUID ${CLIENT_OPERATION_ID_HEADER} header is required`,
    );
  }

  if (bodyOperationId && parsedHeader?.success) {
    if (bodyOperationId !== parsedHeader.data) {
      throw new HttpError(409, "CONFLICT", "The operation ids do not match");
    }

    return bodyOperationId;
  }

  if (bodyOperationId) {
    return bodyOperationId;
  }

  if (parsedHeader?.success) {
    return parsedHeader.data;
  }

  return requireClientOperationId(request);
}

/**
 * The ledger only ever stores a plain integer; "unit" here is purely the
 * ml<->l input convenience (a goal's own display unit lives on the goal
 * row, not the delta). Liters convert to whole ml; anything else must
 * already be a whole number.
 */
export function normalizeDayAmount(input: DayAmountInput): DayAmountInput {
  if (input.unit === "l" || input.unit === "ml") {
    try {
      return {
        ...input,
        amount: normalizeWaterAmount(input.amount, input.unit),
        unit: "ml",
      };
    } catch {
      throw validationError(
        "Amount must resolve to a nonzero whole ml value",
      );
    }
  }

  if (!Number.isInteger(input.amount)) {
    throw validationError("Amount must be a whole number");
  }

  return input;
}

export function parseAndNormalizeDayEntry(
  value: unknown,
  operationId: string,
): DayEntryInput {
  const input = parseDayEntryInput(value);
  if ("containerId" in input) {
    return { ...input, clientOperationId: operationId };
  }

  return {
    ...normalizeDayAmount(input),
    clientOperationId: operationId,
  };
}

export function parseAndResolveGoalDoneToggle(
  value: unknown,
  request: Request,
  goalId: string,
): GoalDoneToggleInput {
  const input = parseGoalDoneToggleInput(value);
  return {
    goalId,
    clientOperationId: resolveClientOperationId(
      request,
      input.clientOperationId,
    ),
  };
}
