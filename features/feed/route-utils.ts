import { HttpError } from "@/lib/http";

const ROUTE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function requireRouteId(value: unknown, resource: string): string {
  if (typeof value !== "string" || !ROUTE_ID_PATTERN.test(value)) {
    throw new HttpError(400, "VALIDATION_ERROR", `Invalid ${resource} id`);
  }

  return value;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Request body must be JSON");
  }
}

export function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Request body must be an object",
    );
  }

  return value as Record<string, unknown>;
}
