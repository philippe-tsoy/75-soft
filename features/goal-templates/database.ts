import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GoalTemplateAdminDTO, GoalTemplateDTO } from "@/lib/types";

export type GoalTemplateRow = {
  id: string;
  name: string;
  target_value: number | string | null;
  unit: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
} & Record<string, unknown>;

type GoalTemplateInsert = {
  name: string;
  target_value?: number | null;
  unit?: string | null;
  sort_order?: number;
  active?: boolean;
} & Record<string, unknown>;

type GoalTemplateUpdate = {
  name?: string;
  target_value?: number | null;
  unit?: string | null;
  sort_order?: number;
  active?: boolean;
} & Record<string, unknown>;

type GoalTemplatesDatabase = {
  public: {
    Tables: {
      goal_templates: {
        Row: GoalTemplateRow;
        Insert: GoalTemplateInsert;
        Update: GoalTemplateUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};

export type GoalTemplatesClient = SupabaseClient<GoalTemplatesDatabase>;

export class GoalTemplatesDatabaseError extends Error {
  constructor(public readonly postgresCode?: string) {
    super("Goal templates database operation failed");
    this.name = "GoalTemplatesDatabaseError";
  }
}

const GOAL_TEMPLATE_COLUMNS =
  "id, name, target_value, unit, sort_order, active, created_at, updated_at";

export async function createGoalTemplatesClient(): Promise<GoalTemplatesClient> {
  const client = await createSupabaseServerClient();
  return client as unknown as GoalTemplatesClient;
}

function throwDatabaseError(error: { code?: string }): never {
  throw new GoalTemplatesDatabaseError(error.code);
}

function asNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new GoalTemplatesDatabaseError();
  }

  return parsed;
}

export function goalTemplateRowToDTO(row: GoalTemplateRow): GoalTemplateDTO {
  return {
    id: row.id,
    name: row.name,
    targetValue: row.target_value === null ? null : asNumber(row.target_value),
    unit: row.unit,
  };
}

export function goalTemplateRowToAdminDTO(
  row: GoalTemplateRow,
): GoalTemplateAdminDTO {
  return {
    ...goalTemplateRowToDTO(row),
    active: row.active,
  };
}

async function resolveClient(
  client?: GoalTemplatesClient,
): Promise<GoalTemplatesClient> {
  return client ?? createGoalTemplatesClient();
}

export async function listActiveGoalTemplateRows(
  client?: GoalTemplatesClient,
): Promise<GoalTemplateRow[]> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("goal_templates")
    .select(GOAL_TEMPLATE_COLUMNS)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throwDatabaseError(error);
  }

  return (data ?? []) as GoalTemplateRow[];
}

export async function listAllGoalTemplateRows(
  client?: GoalTemplatesClient,
): Promise<GoalTemplateRow[]> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("goal_templates")
    .select(GOAL_TEMPLATE_COLUMNS)
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throwDatabaseError(error);
  }

  return (data ?? []) as GoalTemplateRow[];
}

export async function createGoalTemplate(
  input: { name: string; targetValue: number | null; unit: string | null },
  client?: GoalTemplatesClient,
): Promise<GoalTemplateRow> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("goal_templates")
    .insert({
      name: input.name,
      target_value: input.targetValue,
      unit: input.unit,
    })
    .select(GOAL_TEMPLATE_COLUMNS)
    .single();

  if (error || !data) {
    throwDatabaseError(error ?? {});
  }

  return data as GoalTemplateRow;
}

export async function updateGoalTemplate(
  templateId: string,
  input: {
    name?: string;
    targetValue?: number | null;
    unit?: string | null;
    active?: boolean;
  },
  client?: GoalTemplatesClient,
): Promise<GoalTemplateRow | null> {
  const db = await resolveClient(client);
  const update: GoalTemplateUpdate = {};

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
    .from("goal_templates")
    .update(update)
    .eq("id", templateId)
    .select(GOAL_TEMPLATE_COLUMNS)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error);
  }

  return data as GoalTemplateRow | null;
}
