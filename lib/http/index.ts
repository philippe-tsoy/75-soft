import { NextResponse } from "next/server";

import { HttpError } from "@/lib/http/errors";
import type { ApiError } from "@/lib/types";

export { HttpError } from "@/lib/http/errors";

export const API_ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  BUSINESS_RULE_VIOLATION: "BUSINESS_RULE_VIOLATION",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export function ok<T>(data: T, status = 200): NextResponse<{ data: T }> {
  return NextResponse.json({ data }, { status });
}

export function paginated<T>(
  data: T[],
  nextCursor: string | null,
  status = 200,
): NextResponse<{ data: T[]; nextCursor: string | null }> {
  return NextResponse.json({ data, nextCursor }, { status });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function fail(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

export function getRequestId(request: Request): string {
  return (
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    crypto.randomUUID()
  );
}

export function handleRouteError(error: unknown): NextResponse<ApiError> {
  if (error instanceof HttpError) {
    return fail(error.status, error.code, error.message, error.details);
  }

  console.error("Unhandled route error", error);
  return fail(500, "INTERNAL_ERROR", "Something went wrong");
}

// These wrappers keep route handlers on one import boundary while the actual
// session lookup remains in the server-only access module.
export async function requireSession(_request?: Request) {
  void _request;
  const access = await import("@/lib/auth/access");
  return access.requireSession();
}

export async function requireActiveMember(_session?: unknown) {
  void _session;
  const access = await import("@/lib/auth/access");
  return access.requireActiveMember();
}

export async function requireAdmin(_session?: unknown) {
  void _session;
  const access = await import("@/lib/auth/access");
  return access.requireAdmin();
}
