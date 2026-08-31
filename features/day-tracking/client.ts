import {
  CLIENT_OPERATION_ID_HEADER,
  createClientOperationId,
} from "@/lib/idempotency";

import type { ApiError } from "@/lib/types";

export class DayApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "DayApiError";
  }
}

interface ApiEnvelope<T> {
  data?: T;
  error?: ApiError["error"];
}

export async function requestDayApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  let envelope: ApiEnvelope<T> = {};

  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    if (!response.ok) {
      throw new DayApiError(
        "The server returned an invalid response",
        response.status,
        "INTERNAL_ERROR",
      );
    }
  }

  if (!response.ok || !envelope.data) {
    throw new DayApiError(
      envelope.error?.message ?? "The request could not be completed",
      response.status,
      envelope.error?.code ?? "INTERNAL_ERROR",
    );
  }

  return envelope.data;
}

export function withOperationId(operationId = createClientOperationId()): {
  operationId: string;
  headers: HeadersInit;
} {
  return {
    operationId,
    headers: {
      "Content-Type": "application/json",
      [CLIENT_OPERATION_ID_HEADER]: operationId,
    },
  };
}
