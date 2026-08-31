import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  OptionalGoalCreateInput,
  OptionalGoalLogInput,
  OptionalGoalPatchInput,
} from "@/features/optional-goals/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OptionalGoalDTO } from "@/lib/types";

export type OptionalGoalRow = {
  id: string;
  owner_id: string;
  name: string;
  target_value: number | string | null;
  unit: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
} & Record<string, unknown>;

export type OptionalGoalProfileRow = {
  id: string;
  timezone: string;
} & Record<string, unknown>;

export type OptionalGoalLogRow = {
  id: string;
  optional_goal_id: string;
  owner_id: string;
  local_date: string;
  value: number | string | null;
  completed: boolean | null;
  client_operation_id: string;
  created_at: string;
} & Record<string, unknown>;

type OptionalGoalInsert = {
  id?: string;
  owner_id: string;
  name: string;
  target_value?: number | null;
  unit?: string | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
} & Record<string, unknown>;

type OptionalGoalUpdate = {
  name?: string;
  target_value?: number | null;
  unit?: string | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
} & Record<string, unknown>;

type OptionalGoalLogInsert = {
  id?: string;
  optional_goal_id: string;
  owner_id: string;
  local_date: string;
  value?: number | null;
  completed?: boolean | null;
  client_operation_id: string;
  created_at?: string;
} & Record<string, unknown>;

type OptionalGoalLogUpdate = Partial<OptionalGoalLogInsert>;

type OptionalGoalProfileInsert = {
  id: string;
  timezone: string;
} & Record<string, unknown>;

type OptionalGoalProfileUpdate = {
  id?: string;
  timezone?: string;
} & Record<string, unknown>;

type OptionalGoalsDatabase = {
  public: {
    Tables: {
      profiles: {
        Row: OptionalGoalProfileRow;
        Insert: OptionalGoalProfileInsert;
        Update: OptionalGoalProfileUpdate;
        Relationships: [];
      };
      optional_goals: {
        Row: OptionalGoalRow;
        Insert: OptionalGoalInsert;
        Update: OptionalGoalUpdate;
        Relationships: [];
      };
      optional_goal_logs: {
        Row: OptionalGoalLogRow;
        Insert: OptionalGoalLogInsert;
        Update: OptionalGoalLogUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};

export type OptionalGoalsClient = SupabaseClient<OptionalGoalsDatabase>;

export class OptionalGoalsDatabaseError extends Error {
  constructor(public readonly postgresCode?: string) {
    super("Optional goals database operation failed");
    this.name = "OptionalGoalsDatabaseError";
  }
}

const OPTIONAL_GOAL_COLUMNS =
  "id, owner_id, name, target_value, unit, active, created_at, updated_at";
const OPTIONAL_GOAL_LOG_COLUMNS =
  "id, optional_goal_id, owner_id, local_date, value, completed, client_operation_id, created_at";

export async function createOptionalGoalsClient(): Promise<OptionalGoalsClient> {
  const client = await createSupabaseServerClient();
  return client as unknown as OptionalGoalsClient;
}

function throwDatabaseError(error: { code?: string }): never {
  throw new OptionalGoalsDatabaseError(error.code);
}

export function asOptionalGoalRow(value: unknown): OptionalGoalRow {
  return value as OptionalGoalRow;
}

export function asOptionalGoalRows(value: unknown): OptionalGoalRow[] {
  return value as OptionalGoalRow[];
}

export function asOptionalGoalLogRow(value: unknown): OptionalGoalLogRow {
  return value as OptionalGoalLogRow;
}

export function asOptionalGoalLogRows(value: unknown): OptionalGoalLogRow[] {
  return value as OptionalGoalLogRow[];
}

function asNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new OptionalGoalsDatabaseError();
  }

  return parsed;
}

export function optionalGoalRowToDTO(row: OptionalGoalRow): OptionalGoalDTO {
  return {
    id: row.id,
    name: row.name,
    targetValue: row.target_value === null ? null : asNumber(row.target_value),
    unit: row.unit,
    active: row.active,
  };
}

export function optionalGoalRowsToDTO(
  rows: OptionalGoalRow[],
): OptionalGoalDTO[] {
  return rows.map(optionalGoalRowToDTO);
}

export function optionalGoalLogRowToDTO(row: OptionalGoalLogRow) {
  return {
    id: row.id,
    optionalGoalId: row.optional_goal_id,
    localDate: row.local_date,
    value: row.value === null ? null : asNumber(row.value),
    completed: row.completed,
    clientOperationId: row.client_operation_id,
    createdAt: row.created_at,
  };
}

async function resolveClient(
  client?: OptionalGoalsClient,
): Promise<OptionalGoalsClient> {
  return client ?? createOptionalGoalsClient();
}

export async function listOptionalGoalRows(
  ownerId: string,
  client?: OptionalGoalsClient,
): Promise<OptionalGoalRow[]> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("optional_goals")
    .select(OPTIONAL_GOAL_COLUMNS)
    .eq("owner_id", ownerId)
    .order("active", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throwDatabaseError(error);
  }

  return asOptionalGoalRows(data ?? []);
}

export async function findOptionalGoalRow(
  ownerId: string,
  goalId: string,
  client?: OptionalGoalsClient,
): Promise<OptionalGoalRow | null> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("optional_goals")
    .select(OPTIONAL_GOAL_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("id", goalId)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error);
  }

  return data ? asOptionalGoalRow(data) : null;
}

export async function createOptionalGoal(
  ownerId: string,
  input: OptionalGoalCreateInput,
  client?: OptionalGoalsClient,
): Promise<OptionalGoalRow> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("optional_goals")
    .insert({
      owner_id: ownerId,
      name: input.name,
      target_value: input.targetValue ?? null,
      unit: input.unit ?? null,
      active: true,
    })
    .select(OPTIONAL_GOAL_COLUMNS)
    .single();

  if (error || !data) {
    throwDatabaseError(error ?? {});
  }

  return asOptionalGoalRow(data);
}

export async function updateOptionalGoal(
  ownerId: string,
  goalId: string,
  input: OptionalGoalPatchInput,
  client?: OptionalGoalsClient,
): Promise<OptionalGoalRow | null> {
  const db = await resolveClient(client);
  const update: OptionalGoalUpdate = {};

  if (input.name !== undefined) {
    update.name = input.name;
  }
  if (input.targetValue !== undefined) {
    update.target_value = input.targetValue;
  }
  if (input.unit !== undefined) {
    update.unit = input.unit;
  }
  if (input.active !== undefined) {
    update.active = input.active;
  }

  const { data, error } = await db
    .from("optional_goals")
    .update(update)
    .eq("owner_id", ownerId)
    .eq("id", goalId)
    .select(OPTIONAL_GOAL_COLUMNS)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error);
  }

  return data ? asOptionalGoalRow(data) : null;
}

export async function findOptionalGoalLogByOperationId(
  ownerId: string,
  clientOperationId: string,
  client?: OptionalGoalsClient,
): Promise<OptionalGoalLogRow | null> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("optional_goal_logs")
    .select(OPTIONAL_GOAL_LOG_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("client_operation_id", clientOperationId)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error);
  }

  return data ? asOptionalGoalLogRow(data) : null;
}

export async function insertOptionalGoalLogIdempotent(
  ownerId: string,
  input: OptionalGoalLogInput,
  optionalGoalId: string,
  client?: OptionalGoalsClient,
): Promise<{ row: OptionalGoalLogRow; idempotent: boolean }> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("optional_goal_logs")
    .insert({
      optional_goal_id: optionalGoalId,
      owner_id: ownerId,
      local_date: input.localDate,
      value: input.value ?? null,
      completed: input.completed ?? null,
      client_operation_id: input.clientOperationId,
    })
    .select(OPTIONAL_GOAL_LOG_COLUMNS)
    .single();

  if (!error && data) {
    return { row: asOptionalGoalLogRow(data), idempotent: false };
  }

  if (error?.code === "23505") {
    const existing = await findOptionalGoalLogByOperationId(
      ownerId,
      input.clientOperationId,
      db,
    );

    if (existing) {
      return { row: existing, idempotent: true };
    }
  }

  throwDatabaseError(error ?? {});
}

export async function listOptionalGoalLogRows(
  ownerId: string,
  optionalGoalId: string,
  client?: OptionalGoalsClient,
): Promise<OptionalGoalLogRow[]> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("optional_goal_logs")
    .select(OPTIONAL_GOAL_LOG_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("optional_goal_id", optionalGoalId)
    .order("local_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throwDatabaseError(error);
  }

  return asOptionalGoalLogRows(data ?? []);
}

export async function getOwnerTimezone(
  ownerId: string,
  client?: OptionalGoalsClient,
): Promise<string | null> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("profiles")
    .select("timezone")
    .eq("id", ownerId)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error);
  }

  return data?.timezone ?? null;
}
