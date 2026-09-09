import type { SupabaseClient } from "@supabase/supabase-js";

import { HttpError } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MemberStatsDTO } from "@/lib/types";

type MemberGoalStatRow = {
  goalId: string;
  name: string;
  isPrivate: boolean;
  active: boolean;
  metDays: number;
  eligibleDays: number;
  pct: number;
};

type MemberStatsRow = {
  day_number: number;
  numerator: number;
  denominator: number;
  pct: number;
  goals: MemberGoalStatRow[] | null;
};

type StatsDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      get_member_stats: {
        Args: { p_user_id: string };
        Returns: MemberStatsRow[];
      };
    };
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};

export type StatsClient = SupabaseClient<StatsDatabase>;

export async function createStatsClient(): Promise<StatsClient> {
  const client = await createSupabaseServerClient();
  return client as unknown as StatsClient;
}

function statsError(error: { message: string }): HttpError {
  const message = error.message.toUpperCase();

  if (message.includes("AUTH_REQUIRED")) {
    return new HttpError(401, "AUTH_REQUIRED", "Authentication is required");
  }
  if (message.includes("FORBIDDEN")) {
    return new HttpError(403, "FORBIDDEN", "You cannot view these stats");
  }
  if (message.includes("NOT_FOUND")) {
    return new HttpError(404, "NOT_FOUND", "Stats were not found");
  }

  return new HttpError(500, "INTERNAL_ERROR", "Unable to load stats");
}

export async function getMemberStats(
  userId: string,
  client?: StatsClient,
): Promise<MemberStatsDTO> {
  const db = client ?? (await createStatsClient());
  const { data, error } = await db.rpc("get_member_stats", {
    p_user_id: userId,
  });

  if (error) {
    throw statsError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Stats were not found");
  }

  return {
    dayNumber: row.day_number,
    metDays: row.numerator,
    eligibleDays: row.denominator,
    pct: row.pct,
    goals: (row.goals ?? []).map((goal) => ({
      goalId: goal.goalId,
      name: goal.name,
      isPrivate: goal.isPrivate,
      active: goal.active,
      metDays: goal.metDays,
      eligibleDays: goal.eligibleDays,
      pct: goal.pct,
    })),
  };
}
