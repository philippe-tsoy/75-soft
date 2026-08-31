import { getYesterday, isEditableDate, isValidISODate } from "@/lib/dates";
import type { OptionalGoalDTO } from "@/lib/types";

import type {
  OptionalGoalDailyState,
  OptionalGoalLogDTO,
  OptionalGoalLogInput,
  OptionalGoalLogResultDTO,
  OptionalGoalMode,
  OptionalGoalStreakToastDTO,
  OptionalGoalWithMode,
} from "@/features/optional-goals/types";

type GoalForCalculation = Pick<OptionalGoalDTO, "id" | "name" | "targetValue">;

export class OptionalGoalRuleError extends Error {
  readonly status = 422;
  readonly code = "BUSINESS_RULE_VIOLATION";

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OptionalGoalRuleError";
  }
}

function sortLogs(logs: OptionalGoalLogDTO[]): OptionalGoalLogDTO[] {
  return [...logs].sort((left, right) => {
    const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
    return byCreatedAt || left.id.localeCompare(right.id);
  });
}

export function getOptionalGoalMode(
  goal: Pick<OptionalGoalDTO, "targetValue">,
): OptionalGoalMode {
  return goal.targetValue === null ? "checkbox" : "numeric";
}

export function optionalGoalWithMode(
  goal: OptionalGoalDTO,
): OptionalGoalWithMode {
  return {
    ...goal,
    mode: getOptionalGoalMode(goal),
  };
}

export function normalizeOptionalGoalLogForGoal(
  goal: Pick<OptionalGoalDTO, "targetValue">,
  input: OptionalGoalLogInput,
): OptionalGoalLogInput {
  const mode = getOptionalGoalMode(goal);
  const hasValue = input.value !== undefined && input.value !== null;
  const hasCompleted =
    input.completed !== undefined && input.completed !== null;

  if (mode === "checkbox" && (!hasCompleted || hasValue)) {
    throw new OptionalGoalRuleError(
      "Checkbox optional goals require a completed state",
    );
  }

  if (mode === "numeric" && (!hasValue || hasCompleted)) {
    throw new OptionalGoalRuleError("Numeric optional goals require a value");
  }

  return {
    ...input,
    value: mode === "numeric" ? (input.value ?? null) : null,
    completed: mode === "checkbox" ? (input.completed ?? null) : null,
  };
}

export function isOptionalGoalLogDateEditable(
  localDate: string,
  memberLocalDate: string,
  joinLocalDate: string,
  invalidated = false,
): boolean {
  return isEditableDate(localDate, memberLocalDate, joinLocalDate, invalidated);
}

export function assertOptionalGoalLogDate(
  localDate: string,
  memberLocalDate: string,
  joinLocalDate: string,
  invalidated = false,
): void {
  if (
    !isOptionalGoalLogDateEditable(
      localDate,
      memberLocalDate,
      joinLocalDate,
      invalidated,
    )
  ) {
    throw new OptionalGoalRuleError(
      "Optional goal logs are limited to today or yesterday",
      { localDate },
    );
  }
}

export function calculateOptionalGoalDailyStates(
  goal: GoalForCalculation,
  logs: OptionalGoalLogDTO[],
): OptionalGoalDailyState[] {
  const states = new Map<
    string,
    { value: number | null; completed: boolean | null }
  >();

  for (const log of sortLogs(
    logs.filter((candidate) => candidate.optionalGoalId === goal.id),
  )) {
    const current = states.get(log.localDate) ?? {
      value: null,
      completed: null,
    };

    if (getOptionalGoalMode(goal) === "checkbox") {
      if (log.completed !== null) {
        current.completed = log.completed;
      }
    } else if (log.value !== null) {
      current.value = (current.value ?? 0) + log.value;
    }

    states.set(log.localDate, current);
  }

  return [...states.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([localDate, state]) => ({
      localDate,
      value: state.value,
      completed: state.completed,
      met:
        getOptionalGoalMode(goal) === "checkbox"
          ? state.completed === true
          : state.value !== null &&
            goal.targetValue !== null &&
            state.value >= goal.targetValue,
    }));
}

export function calculateOptionalGoalDailyState(
  goal: GoalForCalculation,
  localDate: string,
  logs: OptionalGoalLogDTO[],
): OptionalGoalDailyState {
  return (
    calculateOptionalGoalDailyStates(goal, logs).find(
      (state) => state.localDate === localDate,
    ) ?? {
      localDate,
      value: null,
      completed: null,
      met: false,
    }
  );
}

export function calculateOptionalGoalStreak(
  goal: GoalForCalculation,
  logs: OptionalGoalLogDTO[],
  endingLocalDate: string,
): number {
  if (!isValidISODate(endingLocalDate)) {
    throw new Error("endingLocalDate must be a valid ISO date");
  }

  const states = calculateOptionalGoalDailyStates(goal, logs);
  const metDates = new Set(
    states.filter((state) => state.met).map((state) => state.localDate),
  );

  let streakDays = 0;
  let date = endingLocalDate;
  while (metDates.has(date) && streakDays <= states.length) {
    streakDays += 1;
    date = getYesterday(date);
  }

  return streakDays;
}

export function optionalGoalStreakToast(
  goal: GoalForCalculation,
  streakDays: number,
): OptionalGoalStreakToastDTO | null {
  if (streakDays < 2) {
    return null;
  }

  return {
    optionalGoalId: goal.id,
    goalName: goal.name,
    streakDays,
    message: `${goal.name}: ${streakDays}-day streak!`,
  };
}

export function buildOptionalGoalLogResult(
  goal: OptionalGoalDTO,
  log: OptionalGoalLogDTO,
  history: OptionalGoalLogDTO[],
): OptionalGoalLogResultDTO {
  const streakDays = calculateOptionalGoalStreak(goal, history, log.localDate);

  return {
    goal,
    log,
    streakDays,
    streakToast: optionalGoalStreakToast(goal, streakDays),
  };
}
