import { HttpError } from "@/lib/http";
import type {
  CalendarCellDTO,
  DayDisplayState,
  DayRollupDTO,
  DailyBoardDTO,
  GoalDotState,
} from "@/lib/types";

import type {
  CalendarCellRow,
  DayQueryError,
  DayRollupRow,
  DailyBoardScoreRow,
  DayTrackingClient,
} from "./database";
import { firstRpcRow } from "./database";
import type { DayTrackingReadService, DailyBoardScoreRpc } from "./types";

const DAY_DISPLAY_STATES = new Set<DayDisplayState>([
  "unscored",
  "future",
  "open",
  "in_progress",
  "partial",
  "complete",
  "missed",
]);

function safeDayStatus(value: string): DayDisplayState {
  return DAY_DISPLAY_STATES.has(value as DayDisplayState)
    ? (value as DayDisplayState)
    : "unscored";
}

function safeAmount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function safeMetCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(4, Math.trunc(value)))
    : 0;
}

export function mapDayRollupRow(row: DayRollupRow): DayRollupDTO {
  const nestedGoals = row.goals;
  const status = safeDayStatus(row.status);
  const maskGoals = row.invalidated || status === "unscored";

  return {
    localDate: row.local_date,
    dayNumber: row.day_number,
    status,
    editable: row.editable,
    invalidated: row.invalidated,
    goals: {
      workout: nestedGoals?.workout
        ? {
            ...nestedGoals.workout,
            amount: safeAmount(nestedGoals.workout.amount),
            met: maskGoals ? false : nestedGoals.workout.met,
          }
        : {
            amount: safeAmount(row.workout_amount),
            target: 45,
            unit: "minutes",
            met: maskGoals ? false : row.workout_amount >= 45,
          },
      water: nestedGoals?.water
        ? {
            ...nestedGoals.water,
            amount: safeAmount(nestedGoals.water.amount),
            met: maskGoals ? false : nestedGoals.water.met,
          }
        : {
            amount: safeAmount(row.water_amount),
            target: 2_000,
            unit: "ml",
            met: maskGoals ? false : row.water_amount >= 2_000,
          },
      reading: nestedGoals?.reading
        ? {
            ...nestedGoals.reading,
            amount: safeAmount(nestedGoals.reading.amount),
            met: maskGoals ? false : nestedGoals.reading.met,
          }
        : {
            amount: safeAmount(row.reading_amount),
            target: 10,
            unit: "pages",
            met: maskGoals ? false : row.reading_amount >= 10,
          },
      diet: nestedGoals?.diet
        ? {
            ...nestedGoals.diet,
            met: maskGoals ? false : nestedGoals.diet.met,
          }
        : {
            target: 1,
            unit: "attestation",
            met: maskGoals ? false : row.diet_met === true,
          },
    },
    metCount: maskGoals ? 0 : safeMetCount(row.met_count),
  };
}

export function mapCalendarCellRow(row: CalendarCellRow): CalendarCellDTO {
  const status = safeDayStatus(row.status);

  return {
    localDate: row.local_date,
    dayNumber: row.day_number,
    status,
    metCount:
      row.invalidated || status === "unscored"
        ? 0
        : safeMetCount(row.met_count),
    editable: row.editable,
    invalidated: row.invalidated,
  };
}

export function mapDailyBoardScoreRow(
  row: DailyBoardScoreRow,
): DailyBoardScoreRpc {
  const eligible = row.eligible === true;
  const goalStates: GoalDotState = {
    workout: eligible && row.workout_met === true,
    water: eligible && row.water_met === true,
    reading: eligible && row.reading_met === true,
    diet: eligible && row.diet_met === true,
  };

  return {
    scoreDate: row.score_date,
    goalsAchievedToday: eligible ? safeMetCount(row.goals_achieved_today) : 0,
    goalStates,
    eligible,
  };
}

export function mapDailyBoardDto(row: DailyBoardScoreRow): DailyBoardDTO {
  const { eligible, ...score } = mapDailyBoardScoreRow(row);
  void eligible;
  return score;
}

function asOfArgument(asOfInstant?: Date | string): string | undefined {
  if (asOfInstant === undefined) {
    return undefined;
  }

  const value =
    asOfInstant instanceof Date ? asOfInstant : new Date(asOfInstant);
  if (Number.isNaN(value.valueOf())) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid as-of instant");
  }

  return value.toISOString();
}

function throwRpcError(error: DayQueryError | null, operation: string): void {
  if (!error) {
    return;
  }

  const message = error.message.toUpperCase();
  if (message.includes("AUTH_REQUIRED")) {
    throw new HttpError(401, "AUTH_REQUIRED", "Authentication is required");
  }

  if (message.includes("FORBIDDEN")) {
    throw new HttpError(403, "FORBIDDEN", "You cannot read this day");
  }

  if (message.includes("INVALID_DATE_RANGE")) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid calendar range");
  }

  if (message.includes("NOT_FOUND")) {
    throw new HttpError(404, "NOT_FOUND", `${operation} was not found`);
  }

  if (error.code === "PGRST116") {
    throw new HttpError(404, "NOT_FOUND", `${operation} was not found`);
  }

  throw new HttpError(500, "INTERNAL_ERROR", "Unable to load day tracking");
}

function requireRow<T>(data: T | T[] | null, operation: string): T {
  const row = firstRpcRow(data);
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", `${operation} was not found`);
  }

  return row;
}

export function createDayTrackingReadService(
  db: DayTrackingClient,
): DayTrackingReadService {
  return {
    async getDayRollup(userId, localDate, asOfInstant) {
      const asOf = asOfArgument(asOfInstant);
      const result = await db.rpc("get_day_rollup", {
        p_user_id: userId,
        p_local_date: localDate,
        ...(asOf ? { p_as_of_instant: asOf } : {}),
      });
      throwRpcError(result.error, "Day");
      return mapDayRollupRow(requireRow(result.data, "Day"));
    },

    async getCalendar(userId, fromDate, toDate, asOfInstant) {
      const asOf = asOfArgument(asOfInstant);
      const result = await db.rpc("get_calendar", {
        p_user_id: userId,
        p_from_date: fromDate,
        p_to_date: toDate,
        ...(asOf ? { p_as_of_instant: asOf } : {}),
      });
      throwRpcError(result.error, "Calendar");
      return (result.data ?? []).map(mapCalendarCellRow);
    },

    async getDailyBoardScore(userId, asOfInstant) {
      const asOf = asOfArgument(asOfInstant);
      const result = await db.rpc("get_daily_board_score", {
        p_user_id: userId,
        ...(asOf ? { p_as_of_instant: asOf } : {}),
      });
      throwRpcError(result.error, "Board score");
      return mapDailyBoardScoreRow(requireRow(result.data, "Board score"));
    },
  };
}
