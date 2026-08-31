import { z } from "zod";

import { HttpError } from "@/lib/http";

export async function readAdminJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "The request body must be valid JSON",
    );
  }
}

export function parseAdminInput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "VALIDATION_ERROR", message, {
      issues: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  return result.data;
}
