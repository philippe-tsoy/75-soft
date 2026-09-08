import { HttpError } from "@/lib/http";

import type {
  DayMutationRow,
  DayQueryError,
  DayTrackingClient,
} from "./database";
import { firstRpcRow } from "./database";
import type {
  DayAmountInput,
  DayContainerInput,
  DayTrackingMutationService,
  GoalDoneToggleInput,
} from "./types";
import { normalizeDayAmount } from "./validation";

function mutationError(error: DayQueryError): HttpError {
  const message = error.message.toUpperCase();

  if (message.includes("AUTH_REQUIRED")) {
    return new HttpError(401, "AUTH_REQUIRED", "Authentication is required");
  }

  if (message.includes("DATE_NOT_EDITABLE")) {
    return new HttpError(
      422,
      "BUSINESS_RULE_VIOLATION",
      "Only today and yesterday can be edited",
    );
  }

  if (message.includes("CONTAINER_NOT_FOUND")) {
    return new HttpError(404, "NOT_FOUND", "Water container was not found");
  }

  if (message.includes("GOAL_ARCHIVED")) {
    return new HttpError(
      422,
      "BUSINESS_RULE_VIOLATION",
      "This goal has been archived",
    );
  }

  if (message.includes("GOAL_NOT_FOUND")) {
    return new HttpError(404, "NOT_FOUND", "Goal was not found");
  }

  if (message.includes("INVALID_GOAL_SHAPE")) {
    return new HttpError(
      400,
      "VALIDATION_ERROR",
      "That action does not match this goal",
    );
  }

  if (message.includes("ACTOR_MISMATCH") || message.includes("FORBIDDEN")) {
    return new HttpError(403, "FORBIDDEN", "You cannot change this day");
  }

  if (message.includes("INVALID_OPERATION")) {
    return new HttpError(400, "VALIDATION_ERROR", "Invalid operation id");
  }

  if (message.includes("INVALID_AMOUNT")) {
    return new HttpError(400, "VALIDATION_ERROR", "Invalid day amount");
  }

  if (message.includes("AMOUNT_ALREADY_ZERO")) {
    return new HttpError(
      422,
      "BUSINESS_RULE_VIOLATION",
      "This amount is already at zero",
    );
  }

  if (message.includes("INVALID_GOAL")) {
    return new HttpError(400, "VALIDATION_ERROR", "Invalid goal");
  }

  if (message.includes("OPERATION_DATE_CONFLICT")) {
    return new HttpError(
      409,
      "CONFLICT",
      "The operation id was already used for another date",
    );
  }

  return new HttpError(500, "INTERNAL_ERROR", "Unable to save day tracking");
}

function getMutationRow(
  data: DayMutationRow | DayMutationRow[] | null,
): DayMutationRow {
  const row = firstRpcRow(data);
  if (!row) {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      "Day mutation returned no result",
    );
  }

  return row;
}

async function runMutation(
  call: () => PromiseLike<{
    data: DayMutationRow | DayMutationRow[] | null;
    error: DayQueryError | null;
  }>,
): Promise<{ deltaId: string; idempotent: boolean }> {
  const result = await call();
  if (result.error) {
    throw mutationError(result.error);
  }

  const row = getMutationRow(result.data);
  return {
    deltaId: row.delta_id,
    idempotent: row.idempotent,
  };
}

export function createDayTrackingMutationService(
  db: DayTrackingClient,
): DayTrackingMutationService {
  return {
    async addAmount(userId, localDate, input) {
      void userId;

      if ("containerId" in input) {
        const containerInput: DayContainerInput = input;
        return runMutation(() =>
          db.rpc("day_add_container_tap", {
            p_local_date: localDate,
            p_container_id: containerInput.containerId,
            p_goal_id: containerInput.goalId,
            p_client_operation_id: containerInput.clientOperationId,
          }),
        );
      }

      const amountInput: DayAmountInput = normalizeDayAmount(input);
      return runMutation(() =>
        db.rpc("day_add_amount", {
          p_local_date: localDate,
          p_goal_id: amountInput.goalId,
          p_amount_int: amountInput.amount,
          p_client_operation_id: amountInput.clientOperationId,
        }),
      );
    },

    async toggleGoalDone(userId, localDate, input) {
      void userId;
      const toggleInput: GoalDoneToggleInput = input;
      return runMutation(() =>
        db.rpc("day_toggle_goal_done", {
          p_local_date: localDate,
          p_goal_id: toggleInput.goalId,
          p_client_operation_id: toggleInput.clientOperationId,
        }),
      );
    },
  };
}
