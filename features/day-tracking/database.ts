import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { DayDisplayState } from "@/lib/types";

export interface WaterContainerRow {
  id: string;
  owner_id: string;
  label: string;
  volume_ml: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  active?: boolean;
}

export interface DayRollupRow {
  local_date: string;
  day_number: number;
  status: DayDisplayState;
  editable: boolean;
  invalidated: boolean;
  workout_amount: number;
  water_amount: number;
  reading_amount: number;
  diet_met: boolean;
  met_count: number;
  goals?: {
    workout: {
      amount: number;
      target: number;
      unit: "minutes";
      met: boolean;
    };
    water: {
      amount: number;
      target: number;
      unit: "ml";
      met: boolean;
    };
    reading: {
      amount: number;
      target: number;
      unit: "pages";
      met: boolean;
    };
    diet: {
      target: number;
      unit: "attestation";
      met: boolean;
    };
  };
}

export interface CalendarCellRow {
  local_date: string;
  day_number: number;
  status: DayDisplayState;
  met_count: number;
  editable: boolean;
  invalidated: boolean;
}

export interface DailyBoardScoreRow {
  score_date: string;
  goals_achieved_today: number;
  workout_met: boolean;
  water_met: boolean;
  reading_met: boolean;
  diet_met: boolean;
  eligible: boolean;
}

export interface DayMutationRow {
  delta_id: string;
  idempotent: boolean;
}

export type DayRpcName =
  | "get_day_rollup"
  | "get_member_day_rollup"
  | "get_calendar"
  | "get_member_calendar"
  | "get_daily_board_score"
  | "get_member_daily_board_score"
  | "day_add_amount"
  | "day_add_container_tap"
  | "day_toggle_diet";

export interface DayRpcArgs {
  get_day_rollup: {
    p_user_id: string;
    p_local_date: string;
    p_as_of_instant?: string;
  };
  get_member_day_rollup: {
    p_viewer_id: string;
    p_user_id: string;
    p_local_date: string;
    p_as_of_instant?: string;
  };
  get_calendar: {
    p_user_id: string;
    p_from_date: string;
    p_to_date: string;
    p_as_of_instant?: string;
  };
  get_member_calendar: {
    p_viewer_id: string;
    p_user_id: string;
    p_from_date: string;
    p_to_date: string;
    p_as_of_instant?: string;
  };
  get_daily_board_score: {
    p_user_id: string;
    p_as_of_instant?: string;
  };
  get_member_daily_board_score: {
    p_viewer_id: string;
    p_user_id: string;
    p_as_of_instant?: string;
  };
  day_add_amount: {
    p_local_date: string;
    p_goal_key: "workout" | "water" | "reading";
    p_amount_int: number;
    p_client_operation_id: string;
  };
  day_add_container_tap: {
    p_local_date: string;
    p_container_id: string;
    p_client_operation_id: string;
  };
  day_toggle_diet: {
    p_local_date: string;
    p_client_operation_id: string;
  };
}

export interface DayRpcReturns {
  get_day_rollup: DayRollupRow[];
  get_member_day_rollup: DayRollupRow[];
  get_calendar: CalendarCellRow[];
  get_member_calendar: CalendarCellRow[];
  get_daily_board_score: DailyBoardScoreRow[];
  get_member_daily_board_score: DailyBoardScoreRow[];
  day_add_amount: DayMutationRow[];
  day_add_container_tap: DayMutationRow[];
  day_toggle_diet: DayMutationRow[];
}

export interface DayQueryError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface DayQueryResult<T> {
  data: T | null;
  error: DayQueryError | null;
}

export interface DayTableQuery<T> extends PromiseLike<DayQueryResult<T[]>> {
  select(columns?: string): DayTableQuery<T>;
  insert(values: Record<string, unknown>): DayTableQuery<T>;
  update(values: Record<string, unknown>): DayTableQuery<T>;
  eq(column: string, value: string | number | boolean): DayTableQuery<T>;
  is(column: string, value: null): DayTableQuery<T>;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): DayTableQuery<T>;
  single(): Promise<DayQueryResult<T>>;
  maybeSingle(): Promise<DayQueryResult<T | null>>;
}

/**
 * The foundation database type intentionally stops before domain tables exist.
 * This local adapter keeps W2's table/RPC boundary typed until the generated
 * schema is refreshed by the coordinator.
 */
export interface DayTrackingClient {
  from(table: "water_containers"): DayTableQuery<WaterContainerRow>;
  rpc<Name extends DayRpcName>(
    functionName: Name,
    args: DayRpcArgs[Name],
  ): PromiseLike<DayQueryResult<DayRpcReturns[Name]>>;
}

export function asDayTrackingClient(
  client: SupabaseClient<Database>,
): DayTrackingClient {
  return client as unknown as DayTrackingClient;
}

export function firstRpcRow<T>(data: T | T[] | null): T | null {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data;
}
