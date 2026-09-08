import type { AccessContext } from "@/lib/auth/access";
import {
  CLIENT_OPERATION_ID_HEADER,
  requireClientOperationId,
} from "@/lib/idempotency";
import {
  handleRouteError,
  HttpError,
  requireActiveMember,
  requireSession,
} from "@/lib/http";

import { GoalsDatabaseError } from "@/features/goals/database";

export async function requireGoalAccess(
  _request: Request,
): Promise<AccessContext> {
  await requireSession();
  return requireActiveMember();
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Request body must be valid JSON",
    );
  }
}

export function resolveClientOperationId(
  request: Request,
  bodyOperationId: string,
): string {
  if (!request.headers.has(CLIENT_OPERATION_ID_HEADER)) {
    return bodyOperationId;
  }

  const headerOperationId = requireClientOperationId(request);
  if (headerOperationId !== bodyOperationId) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "The operation id in the body and header must match",
    );
  }

  return headerOperationId;
}

function mapDatabaseError(error: unknown): unknown {
  if (!(error instanceof GoalsDatabaseError)) {
    return error;
  }

  if (error.postgresCode === "23514") {
    return new HttpError(422, "BUSINESS_RULE_VIOLATION", "That goal change is not allowed");
  }

  if (error.postgresCode === "23503") {
    return new HttpError(404, "NOT_FOUND", "The goal was not found");
  }

  if (error.postgresCode === "42501") {
    return new HttpError(
      403,
      "FORBIDDEN",
      "An active group membership is required",
    );
  }

  return error;
}

export function handleGoalRouteError(error: unknown) {
  return handleRouteError(mapDatabaseError(error));
}

export function privateResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
