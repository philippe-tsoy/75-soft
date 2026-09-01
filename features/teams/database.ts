import type { SupabaseClient } from "@supabase/supabase-js";

import { HttpError } from "@/lib/http";
import { rankByScore } from "@/lib/scoring";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type {
  MyTeamDTO,
  TeamBoardEntryDTO,
  TeamRosterMemberDTO,
  TeamSummaryDTO,
} from "@/lib/types";

import { hydrateMemberProfile } from "@/features/board/database";

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
};

function asRpcClient(client: SupabaseClient<Database>): RpcClient {
  return client as unknown as RpcClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowsFrom(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

async function call(
  client: SupabaseClient<Database>,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await asRpcClient(client).rpc(name, args);
  if (result.error) {
    throw mapRpcError(name, result.error);
  }

  return result.data;
}

function mapRpcError(name: string, error: RpcError): HttpError {
  const message = error.message ?? "";

  if (message.includes("AUTH_REQUIRED")) {
    return new HttpError(401, "AUTH_REQUIRED", "Sign in to continue");
  }
  if (message.includes("FORBIDDEN")) {
    return new HttpError(403, "FORBIDDEN", "You cannot do that");
  }
  if (message.includes("NOT_FOUND")) {
    return new HttpError(404, "NOT_FOUND", "Team was not found");
  }
  if (error.code === "23505" || message.includes("CONFLICT")) {
    return new HttpError(409, "CONFLICT", "A team with that name exists");
  }
  if (error.code === "23514" || message.includes("VALIDATION_ERROR")) {
    return new HttpError(
      400,
      "VALIDATION_ERROR",
      "Team names must be 2–40 characters",
    );
  }

  return new HttpError(500, "INTERNAL_ERROR", `The ${name} call failed`);
}

function teamBoardRowToEntry(
  row: Record<string, unknown>,
): Omit<TeamBoardEntryDTO, "rank"> & { teamId: string; pct: number } {
  return {
    teamId: String(row.team_id ?? row.teamId ?? ""),
    name: String(row.name ?? ""),
    memberCount: Number(row.member_count ?? row.memberCount ?? 0),
    pct: Number(row.pct ?? 0),
  };
}

export async function getTeamBoard(
  viewerId: string,
  client?: SupabaseClient<Database>,
): Promise<TeamBoardEntryDTO[]> {
  const supabase = client ?? (await createSupabaseServerClient());
  const data = await call(supabase, "get_team_board", {
    p_viewer_id: viewerId,
  });
  const entries = rowsFrom(data).map(teamBoardRowToEntry);
  const ranked = rankByScore(
    entries.map((entry) => ({ id: entry.teamId, score: entry.pct })),
  );
  const byId = new Map(entries.map((entry) => [entry.teamId, entry]));

  return ranked.map((rankedEntry) => {
    const entry = byId.get(rankedEntry.id);
    if (!entry) {
      throw new HttpError(500, "INTERNAL_ERROR", "Team board is inconsistent");
    }

    return { ...entry, rank: rankedEntry.rank };
  });
}

export async function getGlobalPercentage(
  viewerId: string,
  client?: SupabaseClient<Database>,
): Promise<number> {
  const supabase = client ?? (await createSupabaseServerClient());
  const data = await call(supabase, "get_global_percentage", {
    p_viewer_id: viewerId,
  });
  const row = rowsFrom(data)[0] ?? (isRecord(data) ? data : {});

  return Number(row.pct ?? 0);
}

export async function getMemberPercentage(
  viewerId: string,
  userId: string,
  client?: SupabaseClient<Database>,
): Promise<number> {
  const supabase = client ?? (await createSupabaseServerClient());
  const data = await call(supabase, "get_member_percentage", {
    p_viewer_id: viewerId,
    p_user_id: userId,
  });
  const row = rowsFrom(data)[0] ?? (isRecord(data) ? data : {});

  return Number(row.pct ?? 0);
}

export async function getTeamSummary(
  viewerId: string,
  teamId: string,
  client?: SupabaseClient<Database>,
): Promise<TeamSummaryDTO> {
  const supabase = client ?? (await createSupabaseServerClient());
  const data = await call(supabase, "get_team_summary", {
    p_viewer_id: viewerId,
    p_team_id: teamId,
  });
  const row = rowsFrom(data)[0];
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Team was not found");
  }

  const rosterRaw = Array.isArray(row.roster) ? row.roster : [];
  const roster: TeamRosterMemberDTO[] = await Promise.all(
    rosterRaw.filter(isRecord).map(async (member): Promise<TeamRosterMemberDTO> => {
      const userId = String(member.userId ?? member.user_id ?? "");
      const profile = await hydrateMemberProfile(supabase, {
        id: userId,
        displayName: "",
        avatarUrl: null,
      });

      return {
        userId,
        profile,
        individualPct: Number(
          member.individualPct ?? member.individual_pct ?? 0,
        ),
        goalsAchievedToday: Number(
          member.goalsAchievedToday ?? member.goals_achieved_today ?? 0,
        ),
      };
    }),
  );

  return {
    teamId: String(row.team_id ?? row.teamId ?? teamId),
    name: String(row.name ?? ""),
    createdBy: String(row.created_by ?? row.createdBy ?? ""),
    memberCount: Number(row.member_count ?? row.memberCount ?? 0),
    pct: Number(row.pct ?? 0),
    roster,
  };
}

export async function getMyTeam(
  viewerId: string,
  client?: SupabaseClient<Database>,
): Promise<MyTeamDTO | null> {
  const supabase = client ?? (await createSupabaseServerClient());
  const data = await call(supabase, "get_my_team", {
    p_viewer_id: viewerId,
  });
  const row = rowsFrom(data)[0];
  if (!row || row.team_id == null) {
    return null;
  }

  return {
    teamId: String(row.team_id ?? row.teamId ?? ""),
    name: String(row.name ?? ""),
    individualPct: Number(row.individual_pct ?? row.individualPct ?? 0),
    teamPct: Number(row.team_pct ?? row.teamPct ?? 0),
  };
}

export async function createTeam(
  name: string,
  client?: SupabaseClient<Database>,
): Promise<string> {
  const supabase = client ?? (await createSupabaseServerClient());
  const data = await call(supabase, "create_team", { p_name: name });
  return String(data);
}

export async function joinTeam(
  teamId: string,
  client?: SupabaseClient<Database>,
): Promise<void> {
  const supabase = client ?? (await createSupabaseServerClient());
  await call(supabase, "join_team", { p_team_id: teamId });
}

export async function leaveTeam(
  userId: string | null,
  client?: SupabaseClient<Database>,
): Promise<void> {
  const supabase = client ?? (await createSupabaseServerClient());
  await call(supabase, "leave_team", { p_user_id: userId });
}

export async function renameTeam(
  teamId: string,
  name: string,
  client?: SupabaseClient<Database>,
): Promise<void> {
  const supabase = client ?? (await createSupabaseServerClient());
  await call(supabase, "rename_team", { p_team_id: teamId, p_name: name });
}
