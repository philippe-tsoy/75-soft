import { countMetGoals, deriveDayStatus } from "@/lib/scoring";
import type { DayRollupDTO } from "@/lib/types";

type AmountGoal = "workout" | "water" | "reading";

function withGoalStates(
  day: DayRollupDTO,
  goalStates: DayRollupDTO["goals"],
  today: string,
): DayRollupDTO {
  const metCount = countMetGoals({
    workout: goalStates.workout.met,
    water: goalStates.water.met,
    reading: goalStates.reading.met,
    diet: goalStates.diet.met,
  });

  return {
    ...day,
    goals: goalStates,
    metCount,
    status: deriveDayStatus({
      eligible: day.status !== "unscored",
      isFuture: day.status === "future",
      isCurrentDay: day.localDate === today,
      metCount,
    }),
  };
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

export function applyOptimisticAmount(
  day: DayRollupDTO,
  goal: AmountGoal,
  amount: number,
  today: string,
): DayRollupDTO {
  if (!day.editable || !Number.isFinite(amount) || amount === 0) {
    return day;
  }

  const progress = day.goals[goal];
  const nextAmount = Math.max(0, (progress.amount ?? 0) + amount);

  return withGoalStates(
    day,
    {
      ...day.goals,
      [goal]: {
        ...progress,
        amount: nextAmount,
        met:
          nextAmount >= (progress.target ?? Number.POSITIVE_INFINITY) ||
          Boolean(progress.markedDone),
      },
    },
    today,
  );
}

export function applyOptimisticAmountGoalDone(
  day: DayRollupDTO,
  goal: AmountGoal,
  today: string,
): DayRollupDTO {
  if (!day.editable) {
    return day;
  }

  const progress = day.goals[goal];
  const nextMarkedDone = !progress.markedDone;

  return withGoalStates(
    day,
    {
      ...day.goals,
      [goal]: {
        ...progress,
        markedDone: nextMarkedDone,
        met:
          (progress.amount ?? 0) >=
            (progress.target ?? Number.POSITIVE_INFINITY) || nextMarkedDone,
      },
    },
    today,
  );
}

export function applyOptimisticDiet(
  day: DayRollupDTO,
  today: string,
): DayRollupDTO {
  if (!day.editable) {
    return day;
  }

  return withGoalStates(
    day,
    {
      ...day.goals,
      diet: {
        ...day.goals.diet,
        met: !day.goals.diet.met,
      },
    },
    today,
  );
}
