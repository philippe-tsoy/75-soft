import type { SupabaseClient } from "@supabase/supabase-js";

import type { GoalCreateInput, GoalPatchInput } from "@/features/goals/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GoalDTO } from "@/lib/types";

export type GoalRow = {
  id: string;
  owner_id: string;
  name: string;
  target_value: number | string | null;
  unit: string | null;
  is_private: boolean;
  template_id: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
} & Record<string, unknown>;

type GoalInsert = {
  owner_id: string;
  name: string;
  target_value?: number | null;
  unit?: string | null;
  is_private?: boolean;
  template_id?: string | null;
  active?: boolean;
} & Record<string, unknown>;

type GoalUpdate = {
  name?: string;
  target_value?: number | null;
  unit?: string | null;
  is_private?: boolean;
  active?: boolean;
} & Record<string, unknown>;

type GoalsDatabase = {
  public: {
    Tables: {
      goals: {
        Row: GoalRow;
        Insert: GoalInsert;
        Update: GoalUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};

export type GoalsClient = SupabaseClient<GoalsDatabase>;

export class GoalsDatabaseError extends Error {
  constructor(public readonly postgresCode?: string) {
    super("Goals database operation failed");
    this.name = "GoalsDatabaseError";
  }
}

const GOAL_COLUMNS =
  "id, owner_id, name, target_value, unit, is_private, template_id, active, sort_order, created_at, updated_at, archived_at";

export async function createGoalsClient(): Promise<GoalsClient> {
  const client = await createSupabaseServerClient();
  return client as unknown as GoalsClient;
}

function throwDatabaseError(error: { code?: string }): never {
  throw new GoalsDatabaseError(error.code);
}

function asGoalRow(value: unknown): GoalRow {
  return value as GoalRow;
}

function asGoalRows(value: unknown): GoalRow[] {
  return value as GoalRow[];
}

function asNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new GoalsDatabaseError();
  }

  return parsed;
}

export function goalRowToDTO(row: GoalRow): GoalDTO {
  return {
    id: row.id,
    name: row.name,
    targetValue: row.target_value === null ? null : asNumber(row.target_value),
    unit: row.unit,
    isPrivate: row.is_private,
    active: row.active,
    templateId: row.template_id,
  };
}

export function goalRowsToDTO(rows: GoalRow[]): GoalDTO[] {
  return rows.map(goalRowToDTO);
}

async function resolveClient(client?: GoalsClient): Promise<GoalsClient> {
  return client ?? createGoalsClient();
}

export async function listGoalRows(
  ownerId: string,
  client?: GoalsClient,
): Promise<GoalRow[]> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("goals")
    .select(GOAL_COLUMNS)
    .eq("owner_id", ownerId)
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throwDatabaseError(error);
  }

  return asGoalRows(data ?? []);
}

export async function findGoalRow(
  ownerId: string,
  goalId: string,
  client?: GoalsClient,
): Promise<GoalRow | null> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("goals")
    .select(GOAL_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("id", goalId)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error);
  }

  return data ? asGoalRow(data) : null;
}

export async function createGoal(
  ownerId: string,
  input: GoalCreateInput,
  client?: GoalsClient,
): Promise<GoalRow> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("goals")
    .insert({
      owner_id: ownerId,
      name: input.name,
      target_value: input.targetValue ?? null,
      unit: input.unit ?? null,
      is_private: input.isPrivate ?? false,
      template_id: input.templateId ?? null,
      active: true,
    })
    .select(GOAL_COLUMNS)
    .single();

  if (error || !data) {
    throwDatabaseError(error ?? {});
  }

  return asGoalRow(data);
}

export async function updateGoal(
  ownerId: string,
  goalId: string,
  input: GoalPatchInput,
  client?: GoalsClient,
): Promise<GoalRow | null> {
  const db = await resolveClient(client);
  const update: GoalUpdate = {};

  if (input.name !== undefined) {
    update.name = input.name;
  }
  if (input.targetValue !== undefined) {
    update.target_value = input.targetValue;
  }
  if (input.unit !== undefined) {
    update.unit = input.unit;
  }
  if (input.isPrivate !== undefined) {
    update.is_private = input.isPrivate;
  }
  if (input.active !== undefined) {
    update.active = input.active;
  }

  const { data, error } = await db
    .from("goals")
    .update(update)
    .eq("owner_id", ownerId)
    .eq("id", goalId)
    .select(GOAL_COLUMNS)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error);
  }

  return data ? asGoalRow(data) : null;
}
