import type { GoalDTO, GoalTemplateDTO } from "@/lib/types";
import type { GoalCreateInput, GoalPatchInput } from "@/features/goals/types";

interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

export class GoalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GoalApiError";
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
    | { data?: T }
    | ApiErrorBody
    | null;

  if (!response.ok) {
    const message =
      body && "error" in body
        ? (body.error?.message ?? "Could not save this goal")
        : "Could not save this goal";
    throw new GoalApiError(message, response.status);
  }

  return (body as { data: T }).data;
}

export function fetchGoals(): Promise<GoalDTO[]> {
  return request<GoalDTO[]>("/api/goals");
}

export function createGoal(input: GoalCreateInput): Promise<GoalDTO> {
  return request<GoalDTO>("/api/goals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateGoal(
  goalId: string,
  input: GoalPatchInput,
): Promise<GoalDTO> {
  return request<GoalDTO>(`/api/goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveGoal(goalId: string): Promise<GoalDTO> {
  return updateGoal(goalId, { active: false });
}

export function fetchGoalTemplates(): Promise<GoalTemplateDTO[]> {
  return request<GoalTemplateDTO[]>("/api/goal-templates");
}
