import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AchievementDTO } from "@/lib/types";

import { toCatalogAchievementDTO } from "@/features/achievements/catalog";
import type {
  AchievementResponseDTO,
  AchievementToastDTO,
} from "@/features/achievements/types";

export interface AchievementCatalogRow {
  id: string;
  code: string;
  title: string;
  description: string;
  is_hidden: boolean;
  sort_order: number;
}

export interface UserAchievementRow {
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  evidence: Record<string, unknown>;
}

export interface AchievementUnlockRow {
  achievement_id: string;
  code: string;
  unlocked_at: string;
}

interface AchievementQueryResult<Row> {
  data: Row[] | null;
  error: { message?: string } | null;
}

interface AchievementCatalogTable {
  select(columns: string): {
    order(
      column: string,
      options: { ascending: boolean },
    ): Promise<AchievementQueryResult<AchievementCatalogRow>>;
  };
}

interface UserAchievementTable {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): Promise<AchievementQueryResult<UserAchievementRow>>;
  };
}

interface AchievementRpcResult {
  data: AchievementUnlockRow[] | null;
  error: { message?: string } | null;
}

interface AchievementClientShape {
  from(table: "achievements"): AchievementCatalogTable;
  from(table: "user_achievements"): UserAchievementTable;
  rpc(
    functionName: "evaluate_achievements",
    args: { p_user_id: string },
  ): Promise<AchievementRpcResult>;
}

export type AchievementClient = AchievementClientShape;

export async function createAchievementClient(): Promise<AchievementClient> {
  const client = await createSupabaseServerClient();
  return client as unknown as AchievementClient;
}

function throwDatabaseError(
  error: { message?: string } | null,
  fallback: string,
): never {
  throw new Error(error?.message ?? fallback);
}

export async function listAchievementDTOs(
  userId: string,
  client: AchievementClient,
): Promise<AchievementDTO[]> {
  const [catalogResult, unlockResult] = await Promise.all([
    client
      .from("achievements")
      .select("id, code, title, description, is_hidden, sort_order")
      .order("sort_order", { ascending: true }),
    client
      .from("user_achievements")
      .select("user_id, achievement_id, unlocked_at, evidence")
      .eq("user_id", userId),
  ]);

  if (catalogResult.error) {
    return throwDatabaseError(
      catalogResult.error,
      "Unable to load the achievement catalog",
    );
  }

  if (unlockResult.error) {
    return throwDatabaseError(
      unlockResult.error,
      "Unable to load achievement progress",
    );
  }

  const unlockedAtByAchievementId = new Map(
    (unlockResult.data ?? []).map((row) => [
      row.achievement_id,
      row.unlocked_at,
    ]),
  );

  return (catalogResult.data ?? []).map((row) =>
    toCatalogAchievementDTO(
      {
        code: row.code,
        title: row.title,
        description: row.description,
        isHidden: row.is_hidden,
      },
      unlockedAtByAchievementId.get(row.id) ?? null,
    ),
  );
}

export async function evaluateAchievements(
  userId: string,
  client: AchievementClient,
): Promise<AchievementUnlockRow[]> {
  const { data, error } = await client.rpc("evaluate_achievements", {
    p_user_id: userId,
  });

  if (error) {
    return throwDatabaseError(error, "Unable to evaluate achievements");
  }

  return data ?? [];
}

function makeToast(
  achievement: AchievementDTO | undefined,
): AchievementToastDTO | null {
  if (!achievement) {
    return null;
  }

  return {
    code: achievement.code as AchievementToastDTO["code"],
    title: achievement.title,
    description: achievement.description,
  };
}

export async function getAchievementResponse(
  userId: string,
  client?: AchievementClient,
): Promise<AchievementResponseDTO> {
  const achievementClient = client ?? (await createAchievementClient());
  const newlyUnlockedRows = await evaluateAchievements(
    userId,
    achievementClient,
  );
  const achievements = await listAchievementDTOs(userId, achievementClient);
  const newlyUnlockedIds = new Set(newlyUnlockedRows.map((row) => row.code));
  const newlyUnlocked = achievements.filter((achievement) =>
    newlyUnlockedIds.has(achievement.code),
  );

  return {
    achievements,
    newlyUnlocked,
    toast: makeToast(newlyUnlocked[0]),
  };
}
