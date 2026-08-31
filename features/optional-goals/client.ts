export const OPTIONAL_GOAL_OPERATION_ID_HEADER = "x-client-operation-id";

export function createOptionalGoalOperationId(): string {
  return crypto.randomUUID();
}
