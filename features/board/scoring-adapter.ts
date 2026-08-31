import type { SupabaseClient } from "@supabase/supabase-js";

import {
  COHORT_START_DATE,
  READING_TARGET_PAGES,
  REQUIRED_GOAL_KEYS,
  WATER_TARGET_ML,
  WORKOUT_TARGET_MINUTES,
} from "@/lib/config/75-soft";
import { getDayNumber } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import type {
  CalendarCellDTO,
  DayDisplayState,
  DayRollupDTO,
  DailyBoardDTO,
  GoalDotState,
  GoalProgressDTO,
  RequiredGoalKey,
} from "@/lib/types";
import type {
  DailyBoardScoreRpc,
  DayTrackingReadService,
} from "@/features/day-tracking/types";

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
};

type RpcResult = {
  data: unknown;
  error: RpcError | null;
};

type UntypedRpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
};

const requiredGoalKeys = [...REQUIRED_GOAL_KEYS] as RequiredGoalKey[];

const dayStatuses: DayDisplayState[] = [
  "unscored",
  "future",
  "open",
  "in_progress",
  "partial",
  "complete",
  "missed",
];

export class ScoringDependencyError extends Error {
  readonly code = "W2_SCORING_UNAVAILABLE";

  constructor(message = "The day-tracking scoring service is unavailable") {
    super(message);
    this.name = "ScoringDependencyError";
  }
}

export function asRpcClient(
  client: SupabaseClient<Database>,
): UntypedRpcClient {
  return client as unknown as UntypedRpcClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return isRecord(value[0]) ? value[0] : null;
  }

  return isRecord(value) ? value : null;
}

function rowsFrom(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (isRecord(value)) {
    const nested = value.data ?? value.rows ?? value.entries ?? value.cells;
    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }

    return [value];
  }

  return [];
}

function valueAt(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return undefined;
}

function recordAt(
  record: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }

  return {};
}

function stringAt(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  const value = valueAt(record, ...keys);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberAt(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  const value = valueAt(record, ...keys);
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(number) ? number : undefined;
}

function booleanAt(
  record: Record<string, unknown>,
  ...keys: string[]
): boolean | undefined {
  const value = valueAt(record, ...keys);
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }
    if (value.toLowerCase() === "false") {
      return false;
    }
  }

  return undefined;
}

function goalStateFromValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }
    if (value.toLowerCase() === "false") {
      return false;
    }
  }

  if (isRecord(value)) {
    return booleanAt(value, "met", "isMet", "is_met", "completed");
  }

  return undefined;
}

function goalStatesFromRow(row: Record<string, unknown>): GoalDotState {
  const nested = recordAt(
    row,
    "goalStates",
    "goal_states",
    "goalDots",
    "goal_dots",
  );
  const goals = recordAt(row, "goals");
  const unavailable =
    booleanAt(row, "invalidated") === true ||
    valueAt(row, "status", "displayState", "display_state") === "unscored";

  return requiredGoalKeys.reduce<GoalDotState>(
    (states, key) => {
      const direct = goalStateFromValue(
        valueAt(
          nested,
          key,
          `${key}Met`,
          `${key}_met`,
          `${key}Completed`,
          `${key}_completed`,
        ),
      );
      const fromGoals = goalStateFromValue(
        valueAt(goals, key, `${key}Met`, `${key}_met`),
      );
      const fromRow = booleanAt(
        row,
        `${key}Met`,
        `${key}_met`,
        `${key}Completed`,
        `${key}_completed`,
      );

      states[key] = unavailable
        ? false
        : (direct ?? fromGoals ?? fromRow ?? false);
      return states;
    },
    {
      workout: false,
      water: false,
      reading: false,
      diet: false,
    },
  );
}

function asGoalProgress(
  key: RequiredGoalKey,
  row: Record<string, unknown>,
): GoalProgressDTO {
  const goals = recordAt(row, "goals");
  const progress = recordAt(goals, key);
  const amountFields: Record<RequiredGoalKey, string[]> = {
    workout: ["workoutMinutes", "workout_minutes"],
    water: ["waterMl", "water_ml"],
    reading: ["readingPages", "reading_pages"],
    diet: ["dietAttested", "diet_attested", "dietValue", "diet_value"],
  };
  const targetFields: Record<RequiredGoalKey, number> = {
    workout: WORKOUT_TARGET_MINUTES,
    water: WATER_TARGET_ML,
    reading: READING_TARGET_PAGES,
    diet: 1,
  };
  const units: Record<
    RequiredGoalKey,
    "minutes" | "ml" | "pages" | "attestation"
  > = {
    workout: "minutes",
    water: "ml",
    reading: "pages",
    diet: "attestation",
  };
  const state = goalStateFromValue(
    valueAt(progress, "met", "isMet", "is_met", "completed", "value"),
  );
  const directAmount = numberAt(progress, "amount", "total", "value");
  const rowAmount = numberAt(row, ...amountFields[key]);
  const directState = goalStateFromValue(
    valueAt(
      row,
      `${key}Met`,
      `${key}_met`,
      `${key}Completed`,
      `${key}_completed`,
    ),
  );
  const unavailable =
    booleanAt(row, "invalidated") === true ||
    valueAt(row, "status", "displayState", "display_state") === "unscored";
  const derivedState = unavailable
    ? false
    : key === "diet"
      ? booleanAt(row, ...amountFields[key])
      : (directAmount ?? rowAmount) !== undefined
        ? (directAmount ?? rowAmount)! >= targetFields[key]
        : undefined;

  return {
    ...((directAmount ?? rowAmount) !== undefined
      ? { amount: directAmount ?? rowAmount }
      : {}),
    target: targetFields[key],
    unit: units[key],
    met: unavailable
      ? false
      : (state ?? directState ?? derivedState ?? goalStatesFromRow(row)[key]),
  };
}

function normalizeStatus(value: unknown): DayDisplayState {
  return typeof value === "string" &&
    dayStatuses.includes(value as DayDisplayState)
    ? (value as DayDisplayState)
    : "open";
}

export function normalizeProfile(value: unknown): {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  timezone?: string;
} {
  const row = firstRecord(value) ?? {};
  const nested = recordAt(row, "user", "profile");
  const source = Object.keys(nested).length > 0 ? nested : row;

  return {
    id: stringAt(source, "id", "userId", "user_id") ?? "",
    displayName:
      stringAt(source, "displayName", "display_name", "name") ??
      "Unknown member",
    avatarUrl: stringAt(source, "avatarUrl", "avatar_url") ?? null,
    ...(stringAt(source, "timezone", "ianaTimezone", "iana_timezone")
      ? {
          timezone: stringAt(
            source,
            "timezone",
            "ianaTimezone",
            "iana_timezone",
          ),
        }
      : {}),
  };
}

export function normalizeGoalStates(value: unknown): GoalDotState {
  return goalStatesFromRow(firstRecord(value) ?? {});
}

export function normalizeDailyBoardScore(
  value: unknown,
  fallbackScoreDate?: string,
): DailyBoardScoreRpc {
  const row = firstRecord(value) ?? {};
  const goalStates = goalStatesFromRow(row);
  const explicitCount = numberAt(
    row,
    "goalsAchievedToday",
    "goals_achieved_today",
    "metCount",
    "met_count",
  );
  const scoreDate =
    stringAt(row, "scoreDate", "score_date", "localDate", "local_date") ??
    fallbackScoreDate ??
    "";

  return {
    scoreDate,
    goalsAchievedToday:
      explicitCount ??
      requiredGoalKeys.reduce(
        (count, key) => count + (goalStates[key] ? 1 : 0),
        0,
      ),
    goalStates,
    eligible:
      booleanAt(row, "eligible", "boardEligible", "board_eligible") ?? true,
  };
}

export function normalizeDayRollup(
  value: unknown,
  fallbackLocalDate?: string,
): DayRollupDTO {
  const row = firstRecord(value) ?? {};
  const localDate =
    stringAt(row, "localDate", "local_date") ?? fallbackLocalDate ?? "";
  const goalStates = goalStatesFromRow(row);
  const explicitMetCount = numberAt(row, "metCount", "met_count");

  return {
    localDate,
    dayNumber:
      numberAt(row, "dayNumber", "day_number") ??
      (localDate ? getDayNumber(localDate, COHORT_START_DATE) : 0),
    status: normalizeStatus(
      valueAt(row, "status", "displayState", "display_state"),
    ),
    editable: booleanAt(row, "editable") ?? false,
    invalidated: booleanAt(row, "invalidated") ?? false,
    goals: {
      workout: asGoalProgress("workout", row),
      water: asGoalProgress("water", row),
      reading: asGoalProgress("reading", row),
      diet: asGoalProgress("diet", row),
    },
    metCount:
      explicitMetCount ??
      requiredGoalKeys.reduce(
        (count, key) => count + (goalStates[key] ? 1 : 0),
        0,
      ),
  };
}

function normalizeCalendarCell(
  value: Record<string, unknown>,
): CalendarCellDTO {
  const localDate = stringAt(value, "localDate", "local_date") ?? "";

  return {
    localDate,
    dayNumber:
      numberAt(value, "dayNumber", "day_number") ??
      (localDate ? getDayNumber(localDate, COHORT_START_DATE) : 0),
    status: normalizeStatus(
      valueAt(value, "status", "displayState", "display_state"),
    ),
    metCount: numberAt(value, "metCount", "met_count") ?? 0,
    editable: booleanAt(value, "editable") ?? false,
    invalidated: booleanAt(value, "invalidated") ?? false,
  };
}

export function normalizeCalendar(value: unknown): CalendarCellDTO[] {
  return rowsFrom(value).map(normalizeCalendarCell);
}

function isMissingRpc(error: RpcError): boolean {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${
    error.details ?? ""
  }`.toLowerCase();

  return (
    error.code === "42883" ||
    text.includes("does not exist") ||
    text.includes("could not find the function") ||
    text.includes("schema cache")
  );
}

async function invokeRpc(
  client: UntypedRpcClient,
  name: string,
  attempts: Record<string, unknown>[],
): Promise<unknown> {
  let lastError: RpcError | null = null;

  for (const args of attempts) {
    const result = await client.rpc(name, args);
    if (!result.error) {
      return result.data;
    }

    lastError = result.error;
    if (!isMissingRpc(result.error)) {
      throw new ScoringDependencyError(`The ${name} scoring read failed`);
    }
  }

  throw new ScoringDependencyError(
    lastError?.message
      ? `The ${name} scoring read is not available`
      : "The day-tracking scoring service is unavailable",
  );
}

export interface ScoringReadAdapter extends DayTrackingReadService {
  getDailyBoardScore(
    userId: string,
    asOfInstant?: Date,
  ): Promise<DailyBoardScoreRpc>;
}

export function createScoringReadAdapter(
  client: SupabaseClient<Database>,
): ScoringReadAdapter {
  const rpcClient = asRpcClient(client);

  return {
    async getDailyBoardScore(userId, asOfInstant = new Date()) {
      const data = await invokeRpc(rpcClient, "get_daily_board_score", [
        {
          p_user_id: userId,
          p_as_of_instant: asOfInstant.toISOString(),
        },
        {
          p_user_id: userId,
          p_as_of: asOfInstant.toISOString(),
        },
        { p_user_id: userId },
      ]);

      return normalizeDailyBoardScore(data);
    },

    async getDayRollup(userId, localDate) {
      const data = await invokeRpc(rpcClient, "get_day_rollup", [
        {
          p_user_id: userId,
          p_local_date: localDate,
          p_as_of: new Date().toISOString(),
        },
        { p_user_id: userId, p_local_date: localDate },
      ]);

      return normalizeDayRollup(data, localDate);
    },

    async getCalendar(userId, fromDate, toDate) {
      const data = await invokeRpc(rpcClient, "get_calendar", [
        {
          p_user_id: userId,
          p_from_date: fromDate,
          p_to_date: toDate,
          p_as_of: new Date().toISOString(),
        },
        {
          p_user_id: userId,
          p_from_date: fromDate,
          p_to_date: toDate,
        },
      ]);

      return normalizeCalendar(data);
    },
  };
}

export function countGoalStates(goalStates: GoalDotState): number {
  return requiredGoalKeys.reduce(
    (count, key) => count + (goalStates[key] ? 1 : 0),
    0,
  );
}

export function toDailyBoardDTO(
  value: unknown,
  fallbackScoreDate?: string,
): DailyBoardDTO {
  return normalizeDailyBoardScore(value, fallbackScoreDate);
}
