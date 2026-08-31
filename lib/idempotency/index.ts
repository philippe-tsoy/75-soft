import { HttpError } from "@/lib/http/errors";
import { operationIdSchema } from "@/lib/validation";

export const CLIENT_OPERATION_ID_HEADER = "x-client-operation-id";

export function requireClientOperationId(request: Request): string {
  const headerValue = request.headers.get(CLIENT_OPERATION_ID_HEADER);
  const parsed = operationIdSchema.safeParse(headerValue);

  if (!parsed.success) {
    throw new HttpError(
      400,
      "CLIENT_OPERATION_ID_REQUIRED",
      `A UUID ${CLIENT_OPERATION_ID_HEADER} header is required`,
    );
  }

  return parsed.data;
}

export function createClientOperationId(): string {
  return crypto.randomUUID();
}
