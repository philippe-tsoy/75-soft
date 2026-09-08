import { deriveDayStatus } from "@/lib/scoring";
import type { DayRollupDTO, GoalProgressDTO } from "@/lib/types";

function withGoals(
  day: DayRollupDTO,
  goals: GoalProgressDTO[],
  today: string,
): DayRollupDTO {
  const metCount = goals.filter((goal) => goal.met).length;
  const totalCount = goals.length;

  return {
    ...day,
    goals,
    metCount,
    totalCount,
    status: deriveDayStatus({
      eligible: day.status !== "unscored",
      isFuture: day.status === "future",
      isCurrentDay: day.localDate === today,
      metCount,
      totalCount,
    }),
  };
}

/**
 * Merges a single goal's confirmed (or reverted) state into a day snapshot
 * and recomputes metCount/totalCount/status from the result. Used instead
 * of replacing the whole day so that a response or rollback for one goal
 * never clobbers another goal's independently in-flight optimistic update.
 */
export function withGoalState(
  day: DayRollupDTO,
  goalId: string,
  goalProgress: GoalProgressDTO,
  today: string,
): DayRollupDTO {
  const exists = day.goals.some((goal) => goal.id === goalId);
  const goals = exists
    ? day.goals.map((goal) => (goal.id === goalId ? goalProgress : goal))
    : [...day.goals, goalProgress];

  return withGoals(day, goals, today);
}

/**
 * The slider picks an absolute total for the day, but the ledger only stores
 * signed deltas. Returns 0 when there is nothing to write, which the caller
 * treats as "skip the request".
 */
export function amountDeltaTo(
  currentAmount: number,
  nextValue: number,
): number {
  if (!Number.isFinite(nextValue)) {
    return 0;
  }

  return Math.round(nextValue) - currentAmount;
}

export type AmountFillResolution =
  | { action: "fill"; nextValue: number }
  | { action: "revert"; nextValue: number }
  | { action: "locked" };

/**
 * Decides what the checkmark's fill/undo shortcut does for a numeric goal.
 * Below the target it fills to the target and hands back the amount to
 * remember; at or above the target it either reverts to a remembered
 * amount (the fill's own undo) or is locked (the target was reached by
 * dragging the slider itself, which has no "previous amount" to restore).
 */
export function resolveAmountFill(
  amount: number,
  target: number,
  previousAmount: number | undefined,
): AmountFillResolution {
  if (amount < target) {
    return { action: "fill", nextValue: target };
  }

  if (previousAmount === undefined) {
    return { action: "locked" };
  }

  return { action: "revert", nextValue: previousAmount };
}

export function applyOptimisticAmount(
  day: DayRollupDTO,
  goalId: string,
  amount: number,
  today: string,
): DayRollupDTO {
  if (!day.editable || !Number.isFinite(amount) || amount === 0) {
    return day;
  }

  const progress = day.goals.find((goal) => goal.id === goalId);
  if (!progress) {
    return day;
  }

  const nextAmount = Math.max(0, (progress.amount ?? 0) + amount);

  return withGoalState(
    day,
    goalId,
    {
      ...progress,
      amount: nextAmount,
      met:
        nextAmount >= (progress.target ?? Number.POSITIVE_INFINITY) ||
        Boolean(progress.markedDone),
    },
    today,
  );
}

export function applyOptimisticGoalDone(
  day: DayRollupDTO,
  goalId: string,
  today: string,
): DayRollupDTO {
  if (!day.editable) {
    return day;
  }

  const progress = day.goals.find((goal) => goal.id === goalId);
  if (!progress) {
    return day;
  }

  const nextMarkedDone = !progress.markedDone;

  return withGoalState(
    day,
    goalId,
    {
      ...progress,
      markedDone: nextMarkedDone,
      met:
        (progress.amount ?? 0) >= (progress.target ?? Number.POSITIVE_INFINITY) ||
        nextMarkedDone,
    },
    today,
  );
}
