import {
  COHORT_START_DATE,
  READING_TARGET_PAGES,
  REQUIRED_GOAL_KEYS,
  WATER_TARGET_ML,
  WORKOUT_TARGET_MINUTES,
} from "@/lib/config/75-soft";
import { getDayNumber, isScoredCalendarDate, type ISODate } from "@/lib/dates";
import type {
  DayDisplayState,
  GoalDotState,
  RequiredGoalKey,
} from "@/lib/types";

export interface GoalTotals {
  workoutMinutes: number;
  waterMl: number;
  readingPages: number;
  dietAttested: boolean;
}

export interface DailyBoardInput {
  activeMember: boolean;
  localDate: ISODate;
  joinLocalDate: ISODate;
  cohortStartDate?: ISODate;
  invalidated?: boolean;
  goalStates: GoalDotState;
}

export interface DailyBoardScore {
  scoreDate: ISODate;
  goalsAchievedToday: number;
  goalStates: GoalDotState;
  eligible: boolean;
}

export function deriveGoalStates(
  totals: GoalTotals,
  invalidated = false,
): GoalDotState {
  const states: GoalDotState = {
    workout: totals.workoutMinutes >= WORKOUT_TARGET_MINUTES,
    water: totals.waterMl >= WATER_TARGET_ML,
    reading: totals.readingPages >= READING_TARGET_PAGES,
    diet: totals.dietAttested,
  };

  if (invalidated) {
    return {
      workout: false,
      water: false,
      reading: false,
      diet: false,
    };
  }

  return states;
}

export function countMetGoals(goalStates: GoalDotState): number {
  return REQUIRED_GOAL_KEYS.reduce(
    (count, key) => count + (goalStates[key] ? 1 : 0),
    0,
  );
}

export function calculateDailyBoardScore(
  input: DailyBoardInput,
): DailyBoardScore {
  const cohortStartDate = input.cohortStartDate ?? COHORT_START_DATE;
  const eligible =
    input.activeMember &&
    isScoredCalendarDate(input.localDate, input.joinLocalDate, cohortStartDate);
  const goalStates = input.invalidated
    ? deriveGoalStates(
        {
          workoutMinutes: 0,
          waterMl: 0,
          readingPages: 0,
          dietAttested: false,
        },
        true,
      )
    : input.goalStates;

  return {
    scoreDate: input.localDate,
    goalsAchievedToday: eligible ? countMetGoals(goalStates) : 0,
    goalStates,
    eligible,
  };
}

export function deriveDayStatus({
  eligible,
  isFuture,
  isCurrentDay,
  metCount,
}: {
  eligible: boolean;
  isFuture: boolean;
  isCurrentDay: boolean;
  metCount: number;
}): DayDisplayState {
  if (!eligible) {
    return "unscored";
  }

  if (isFuture) {
    return "future";
  }

  if (metCount >= REQUIRED_GOAL_KEYS.length) {
    return "complete";
  }

  if (isCurrentDay) {
    return metCount === 0 ? "open" : "in_progress";
  }

  return metCount === 0 ? "missed" : "partial";
}

export interface BoardRankInput {
  userId: string;
  goalsAchievedToday: number;
  scoreDate: ISODate;
}

export interface BoardRankedEntry extends BoardRankInput {
  rank: number;
}

export function rankDailyBoard(
  entries: readonly BoardRankInput[],
): BoardRankedEntry[] {
  const sorted = [...entries].sort(
    (left, right) => right.goalsAchievedToday - left.goalsAchievedToday,
  );

  return sorted.map((entry, index) => {
    const previous = sorted[index - 1];
    const rank =
      index > 0 && previous.goalsAchievedToday === entry.goalsAchievedToday
        ? sorted.findIndex(
            (candidate) =>
              candidate.goalsAchievedToday === entry.goalsAchievedToday,
          ) + 1
        : index + 1;

    return { ...entry, rank };
  });
}

export interface ScoreRankInput {
  id: string;
  score: number;
}

export interface ScoreRankedEntry extends ScoreRankInput {
  rank: number;
}

// Same competition-ranking algorithm as rankDailyBoard (1, 1, 3), generalized
// to any single numeric score so team-percentage ranking does not duplicate
// the tie logic.
export function rankByScore(
  entries: readonly ScoreRankInput[],
): ScoreRankedEntry[] {
  const sorted = [...entries].sort((left, right) => right.score - left.score);

  return sorted.map((entry, index) => {
    const previous = sorted[index - 1];
    const rank =
      index > 0 && previous.score === entry.score
        ? sorted.findIndex((candidate) => candidate.score === entry.score) + 1
        : index + 1;

    return { ...entry, rank };
  });
}

export function requiredGoalMet(
  key: RequiredGoalKey,
  totals: GoalTotals,
): boolean {
  return deriveGoalStates(totals)[key];
}

export function getCohortDayNumber(
  localDate: ISODate,
  cohortStartDate: ISODate = COHORT_START_DATE,
): number {
  return getDayNumber(localDate, cohortStartDate);
}
