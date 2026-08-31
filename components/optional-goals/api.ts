import type {
  OptionalGoalCreateInput,
  OptionalGoalLogInput,
  OptionalGoalLogResultDTO,
  OptionalGoalPatchInput,
} from "@/features/optional-goals/types";
import { OPTIONAL_GOAL_OPERATION_ID_HEADER } from "@/features/optional-goals/client";
import type { OptionalGoalDTO } from "@/lib/types";

interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

export class OptionalGoalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OptionalGoalApiError";
  }
}

async function request<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => null)) as
    { data?: T } | ApiErrorBody | null;

  if (!response.ok) {
    const message =
      body && "error" in body
        ? (body.error?.message ?? "Could not save optional goal")
        : "Could not save optional goal";
    throw new OptionalGoalApiError(message, response.status);
  }

  return (body as { data: T }).data;
}

export function fetchOptionalGoals(): Promise<OptionalGoalDTO[]> {
  return request<OptionalGoalDTO[]>("/api/optional-goals");
}

export function createOptionalGoal(
  input: OptionalGoalCreateInput,
): Promise<OptionalGoalDTO> {
  return request<OptionalGoalDTO>("/api/optional-goals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateOptionalGoal(
  goalId: string,
  input: OptionalGoalPatchInput,
): Promise<OptionalGoalDTO> {
  return request<OptionalGoalDTO>(`/api/optional-goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveOptionalGoal(goalId: string): Promise<OptionalGoalDTO> {
  return updateOptionalGoal(goalId, { active: false });
}

export function logOptionalGoal(
  goalId: string,
  input: OptionalGoalLogInput,
): Promise<OptionalGoalLogResultDTO> {
  return request<OptionalGoalLogResultDTO>(
    `/api/optional-goals/${goalId}/log`,
    {
      method: "POST",
      headers: {
        [OPTIONAL_GOAL_OPERATION_ID_HEADER]: input.clientOperationId,
      },
      body: JSON.stringify(input),
    },
  );
}
