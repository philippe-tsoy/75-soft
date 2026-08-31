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

export function applyOptimisticAmount(
  day: DayRollupDTO,
  goal: AmountGoal,
  amount: number,
  today: string,
): DayRollupDTO {
  if (!day.editable || !Number.isFinite(amount) || amount <= 0) {
    return day;
  }

  const progress = day.goals[goal];
  const nextAmount = (progress.amount ?? 0) + amount;

  return withGoalStates(
    day,
    {
      ...day.goals,
      [goal]: {
        ...progress,
        amount: nextAmount,
        met: nextAmount >= (progress.target ?? Number.POSITIVE_INFINITY),
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
