import type { SupabaseClient } from "@supabase/supabase-js";

import { toProfileDTO as toSignedProfileDTO } from "@/features/profiles/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { BoardEntryDTO, ProfileDTO } from "@/lib/types";
import { rankDailyBoard } from "@/lib/scoring";

import {
  asRpcClient,
  normalizeDailyBoardScore,
  normalizeProfile,
  normalizeGoalStates,
} from "./scoring-adapter";
import type { BoardRpcRow, GroupStripEntryDTO } from "./types";

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
};

export class ReadModelError extends Error {
  readonly rpcName: string;
  readonly missingFunction: boolean;
  readonly code?: string;

  constructor(rpcName: string, error: RpcError) {
    super(`The ${rpcName} read model is unavailable`);
    this.name = "ReadModelError";
    this.rpcName = rpcName;
    this.code = error.code;
    this.missingFunction =
      error.code === "42883" ||
      `${error.message ?? ""} ${error.details ?? ""}`
        .toLowerCase()
        .includes("does not exist");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAt(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return undefined;
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

  if (!isRecord(value)) {
    return [];
  }

  const nested = value.entries ?? value.rows ?? value.data;
  return Array.isArray(nested) ? nested.filter(isRecord) : [value];
}

export async function readRpc(
  client: SupabaseClient<Database>,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await asRpcClient(client).rpc(name, args);
  if (result.error) {
    throw new ReadModelError(name, result.error);
  }

  return result.data;
}

function memberProfile(value: unknown): ProfileDTO {
  const profile = normalizeProfile(value);

  return {
    id: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
}

export async function hydrateMemberProfile(
  client: SupabaseClient<Database>,
  profile: ProfileDTO,
): Promise<ProfileDTO> {
  try {
    const { data, error } = await client
      .from("profiles")
      .select("id, display_name, avatar_path, timezone")
      .eq("id", profile.id)
      .maybeSingle();

    if (error || !data) {
      return profile;
    }

    const hydrated = await toSignedProfileDTO(data, client);
    return {
      id: hydrated.id,
      displayName: hydrated.displayName,
      avatarUrl: hydrated.avatarUrl,
    };
  } catch {
    // A missing/expired avatar must not make aggregate reads unavailable.
    return profile;
  }
}

async function hydrateBoardEntries(
  client: SupabaseClient<Database>,
  entries: BoardEntryDTO[],
): Promise<BoardEntryDTO[]> {
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      user: await hydrateMemberProfile(client, entry.user),
    })),
  );
}

async function hydrateGroupStripEntries(
  client: SupabaseClient<Database>,
  entries: GroupStripEntryDTO[],
): Promise<GroupStripEntryDTO[]> {
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      user: await hydrateMemberProfile(client, entry.user),
    })),
  );
}

function boardEntryFromRow(
  row: BoardRpcRow,
  index: number,
): BoardEntryDTO & { userId: string } {
  const user = memberProfile(row);
  const score = normalizeDailyBoardScore(row);

  return {
    userId: user.id,
    rank: numberAt(row, "rank") ?? index + 1,
    user,
    goalsAchievedToday:
      numberAt(row, "goalsAchievedToday", "goals_achieved_today") ??
      score.goalsAchievedToday,
    scoreDate: stringAt(row, "scoreDate", "score_date") ?? score.scoreDate,
  };
}

function groupStripFromRow(row: BoardRpcRow): GroupStripEntryDTO {
  const user = memberProfile(row);
  const score = normalizeDailyBoardScore(row);
  const localDate = stringAt(row, "localDate", "local_date") ?? score.scoreDate;

  return {
    user,
    localDate,
    dayNumber: numberAt(row, "dayNumber", "day_number") ?? 0,
    goalDots: normalizeGoalStates(row),
    goalsAchievedToday:
      numberAt(row, "goalsAchievedToday", "goals_achieved_today") ??
      score.goalsAchievedToday,
    scoreDate:
      stringAt(row, "scoreDate", "score_date") ?? score.scoreDate ?? localDate,
  };
}

export async function getBoardEntries(
  viewerId: string,
  client?: SupabaseClient<Database>,
): Promise<BoardEntryDTO[]> {
  const supabase = client ?? (await createSupabaseServerClient());
  const data = await readRpc(supabase, "get_board", {
    viewer_id: viewerId,
  });
  const rows = rowsFrom(data);

  const ranked = rankDailyBoard(
    rows.map((row, index) => {
      const entry = boardEntryFromRow(row, index);
      return {
        userId: entry.userId,
        goalsAchievedToday: entry.goalsAchievedToday,
        scoreDate: entry.scoreDate,
      };
    }),
  );
  const entriesById = new Map(
    rows.map((row, index) => {
      const entry = boardEntryFromRow(row, index);
      return [entry.userId, entry] as const;
    }),
  );

  const entries = ranked.map((rankedEntry) => {
    const entry = entriesById.get(rankedEntry.userId);
    if (!entry) {
      throw new ReadModelError("get_board", {
        message: "The board read returned an invalid member",
      });
    }

    return {
      rank: rankedEntry.rank,
      user: entry.user,
      goalsAchievedToday: rankedEntry.goalsAchievedToday,
      scoreDate: rankedEntry.scoreDate,
    };
  });

  return hydrateBoardEntries(supabase, entries);
}

export async function getGroupStripEntries(
  viewerId: string,
  client?: SupabaseClient<Database>,
): Promise<GroupStripEntryDTO[]> {
  const supabase = client ?? (await createSupabaseServerClient());
  const data = await readRpc(supabase, "get_group_strip", {
    viewer_id: viewerId,
  });

  return hydrateGroupStripEntries(
    supabase,
    rowsFrom(data).map(groupStripFromRow),
  );
}

export const getBoard = getBoardEntries;
export const getGroupStrip = getGroupStripEntries;

export { firstRecord };
