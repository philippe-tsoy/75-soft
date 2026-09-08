import { COHORT_START_DATE } from "@/lib/config/75-soft";
import { getDayNumber, type ISODate } from "@/lib/dates";
import type { DayDisplayState } from "@/lib/types";

export interface DailyBoardScore {
  scoreDate: ISODate;
  metCount: number;
  totalCount: number;
  eligible: boolean;
}

export function deriveDayStatus({
  eligible,
  isFuture,
  isCurrentDay,
  metCount,
  totalCount,
}: {
  eligible: boolean;
  isFuture: boolean;
  isCurrentDay: boolean;
  metCount: number;
  totalCount: number;
}): DayDisplayState {
  if (!eligible) {
    return "unscored";
  }

  if (isFuture) {
    return "future";
  }

  if (totalCount === 0) {
    return "unscored";
  }

  if (metCount === totalCount) {
    return "complete";
  }

  if (isCurrentDay) {
    return metCount === 0 ? "open" : "in_progress";
  }

  return metCount === 0 ? "missed" : "partial";
}

export interface BoardRankInput {
  userId: string;
  metCount: number;
  totalCount: number;
  scoreDate: ISODate;
}

export interface BoardRankedEntry extends BoardRankInput {
  rank: number;
}

/**
 * Percentage of a member's own active goals met, not a raw count -- so
 * members with different-sized goal lists compare fairly. A member with
 * zero active goals ranks last (a bare count has nothing to divide by).
 */
function boardRankScore(entry: BoardRankInput): number {
  return entry.totalCount === 0 ? -1 : entry.metCount / entry.totalCount;
}

export function rankDailyBoard(
  entries: readonly BoardRankInput[],
): BoardRankedEntry[] {
  const sorted = [...entries].sort(
    (left, right) => boardRankScore(right) - boardRankScore(left),
  );

  return sorted.map((entry, index) => {
    const previous = sorted[index - 1];
    const rank =
      index > 0 && boardRankScore(previous) === boardRankScore(entry)
        ? sorted.findIndex(
            (candidate) => boardRankScore(candidate) === boardRankScore(entry),
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

export function getCohortDayNumber(
  localDate: ISODate,
  cohortStartDate: ISODate = COHORT_START_DATE,
): number {
  return getDayNumber(localDate, cohortStartDate);
}
