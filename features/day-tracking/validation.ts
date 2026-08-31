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
  positiveAmountSchema,
} from "@/lib/validation";

import type {
  ContainerCreateInput,
  ContainerUpdateInput,
  DayAmountInput,
  DayEntryInput,
  DayContainerInput,
  DietToggleInput,
} from "./types";

const amountGoalSchema = z.enum(["workout", "water", "reading"]);
const amountUnitSchema = z.enum(["minutes", "ml", "l", "pages"]);

export const dayAmountInputSchema = z
  .object({
    goal: amountGoalSchema,
    amount: positiveAmountSchema,
    unit: amountUnitSchema.optional(),
    clientOperationId: operationIdSchema.optional(),
  })
  .strict();

export const dayContainerInputSchema = z
  .object({
    goal: z.literal("water"),
    containerId: z.string().uuid(),
    clientOperationId: operationIdSchema.optional(),
  })
  .strict();

export const dayEntryInputSchema = z.union([
  dayAmountInputSchema,
  dayContainerInputSchema,
]);

export const dietToggleInputSchema = z
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

export function parseDietToggleInput(
  value: unknown,
): z.infer<typeof dietToggleInputSchema> {
  const parsed = dietToggleInputSchema.safeParse(value);
  if (!parsed.success) {
    throw zodValidationError("Invalid diet toggle", parsed.error);
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

export function normalizeDayAmount(input: DayAmountInput): DayAmountInput {
  if (input.goal === "water") {
    const unit = input.unit ?? "ml";

    if (unit !== "ml" && unit !== "l") {
      throw validationError("Water entries must use ml or l");
    }

    try {
      return {
        ...input,
        amount: normalizeWaterAmount(input.amount, unit),
        unit: "ml",
      };
    } catch {
      throw validationError(
        "Water amount must resolve to a positive whole ml value",
      );
    }
  }

  const expectedUnit = input.goal === "workout" ? "minutes" : "pages";
  if (input.unit !== undefined && input.unit !== expectedUnit) {
    throw validationError(`${input.goal} entries must use ${expectedUnit}`);
  }

  if (!Number.isInteger(input.amount)) {
    throw validationError(`${input.goal} entries must be whole numbers`);
  }

  return {
    ...input,
    unit: expectedUnit,
  };
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

export function parseAndResolveDietToggle(
  value: unknown,
  request: Request,
): DietToggleInput {
  const input = parseDietToggleInput(value);
  return {
    clientOperationId: resolveClientOperationId(
      request,
      input.clientOperationId,
    ),
  };
}
