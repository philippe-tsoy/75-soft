import type { SupabaseClient } from "@supabase/supabase-js";

import { COHORT_START_DATE, isRequiredGoalKey } from "@/lib/config/75-soft";
import { getMemberLocalDate } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type {
  AchievementDTO,
  CommentDTO,
  PostDTO,
  PostGoalDTO,
  ProfileDTO,
  ReactionSummaryDTO,
} from "@/lib/types";

import {
  POST_COLUMNS,
  type FeedClient,
  type FeedPostRow,
} from "@/features/feed/database";
import { getVisiblePost } from "@/features/feed/service";
import {
  firstRecord,
  hydrateMemberProfile,
  ReadModelError,
  readRpc,
} from "@/features/board/database";
import {
  normalizeCalendar,
  normalizeDayRollup,
  normalizeProfile,
} from "@/features/board/scoring-adapter";
import {
  asDayTrackingClient,
  createDayTrackingReadService,
} from "@/features/day-tracking";
import type { PersonSummaryDTO } from "./types";

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

function publicProfile(value: unknown): ProfileDTO {
  const profile = normalizeProfile(value);

  return {
    id: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
}

function recordsFrom(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function normalizeAchievement(value: unknown): AchievementDTO {
  const row = isRecord(value) ? value : {};
  const isHidden = booleanAt(row, "isHidden", "is_hidden") ?? false;
  const unlockedAt = stringAt(row, "unlockedAt", "unlocked_at") ?? null;
  const locked = isHidden && unlockedAt === null;

  return {
    code: stringAt(row, "code") ?? "",
    title: locked ? "???" : (stringAt(row, "title") ?? "Achievement"),
    description: locked ? "???" : (stringAt(row, "description") ?? ""),
    isHidden,
    unlockedAt,
  };
}

function normalizeReaction(value: unknown): ReactionSummaryDTO | null {
  const row = isRecord(value) ? value : {};
  const emoji = stringAt(row, "emoji");
  if (!emoji) {
    return null;
  }

  return {
    emoji,
    count: numberAt(row, "count") ?? 0,
    reactedByViewer:
      booleanAt(row, "reactedByViewer", "reacted_by_viewer") ?? false,
  };
}

function normalizeComment(value: unknown): CommentDTO | null {
  const row = isRecord(value) ? value : {};
  const id = stringAt(row, "id");
  if (!id) {
    return null;
  }

  return {
    id,
    author: publicProfile(valueAt(row, "author", "profile")),
    body: stringAt(row, "body") ?? "",
    createdAt: stringAt(row, "createdAt", "created_at") ?? "",
    canDelete: booleanAt(row, "canDelete", "can_delete") ?? false,
  };
}

function normalizePostGoal(value: unknown): PostGoalDTO | null {
  const row = isRecord(value) ? value : {};
  const kind = stringAt(row, "kind");

  if (kind === "required") {
    const key = stringAt(row, "key", "requiredGoalKey", "required_goal_key");
    if (!key || !isRequiredGoalKey(key)) {
      return null;
    }

    return {
      kind,
      key,
      amount: numberAt(row, "amount", "amountInt", "amount_int") ?? null,
      unit: stringAt(row, "unit") ?? null,
      met: booleanAt(row, "met") ?? false,
    };
  }

  if (kind === "optional") {
    const optionalGoalId = stringAt(row, "optionalGoalId", "optional_goal_id");
    if (!optionalGoalId) {
      return null;
    }

    return {
      kind,
      optionalGoalId,
      name: stringAt(row, "name") ?? "Optional goal",
      value: numberAt(row, "value", "optionalValue", "optional_value") ?? null,
      completed:
        booleanAt(
          row,
          "completed",
          "optionalCompleted",
          "optional_completed",
        ) ?? null,
    };
  }

  return null;
}

function normalizePost(value: unknown): PostDTO | null {
  const row = isRecord(value) ? value : {};
  const id = stringAt(row, "id");
  if (!id) {
    return null;
  }

  const goals = recordsFrom(valueAt(row, "goals")).flatMap((goal) => {
    const normalized = normalizePostGoal(goal);
    return normalized ? [normalized] : [];
  });
  const reactions = recordsFrom(valueAt(row, "reactions")).flatMap(
    (reaction) => {
      const normalized = normalizeReaction(reaction);
      return normalized ? [normalized] : [];
    },
  );
  const comments = recordsFrom(valueAt(row, "comments")).flatMap((comment) => {
    const normalized = normalizeComment(comment);
    return normalized ? [normalized] : [];
  });

  return {
    id,
    author: publicProfile(valueAt(row, "author", "profile")),
    localDate: stringAt(row, "localDate", "local_date") ?? "",
    createdAt: stringAt(row, "createdAt", "created_at") ?? "",
    goals,
    note: stringAt(row, "note") ?? null,
    photoUrl: stringAt(row, "photoUrl", "photo_url") ?? null,
    reactions,
    comments,
    canDelete: booleanAt(row, "canDelete", "can_delete") ?? false,
  };
}

function normalizePersonPayload(
  value: unknown,
  viewerId: string,
  subjectId: string,
): PersonSummaryDTO | null {
  const row = firstRecord(value);
  if (!row) {
    return null;
  }

  const profile = publicProfile(valueAt(row, "profile", "user"));
  if (!profile.id) {
    return null;
  }

  const currentDay = normalizeDayRollup(
    valueAt(row, "currentDay", "current_day"),
  );
  const achievements = recordsFrom(valueAt(row, "achievements")).map(
    normalizeAchievement,
  );
  const posts = recordsFrom(valueAt(row, "posts")).flatMap((post) => {
    const normalized = normalizePost(post);
    return normalized ? [normalized] : [];
  });

  return {
    profile,
    goalsAchievedToday:
      numberAt(row, "goalsAchievedToday", "goals_achieved_today") ??
      currentDay.metCount,
    calendar: normalizeCalendar(valueAt(row, "calendar")),
    currentDay,
    achievements,
    posts,
    canEdit: booleanAt(row, "canEdit", "can_edit") ?? viewerId === subjectId,
  };
}

async function readPublishedPersonPosts(
  client: SupabaseClient<Database>,
  viewerId: string,
  subjectId: string,
  fallback: PostDTO[],
): Promise<PostDTO[]> {
  try {
    const { data: cohort, error: cohortError } = await client
      .from("cohorts")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    if (cohortError || !cohort) {
      return fallback;
    }

    const { data: membership, error: membershipError } = await client
      .from("memberships")
      .select("role")
      .eq("user_id", viewerId)
      .eq("cohort_id", cohort.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return fallback;
    }

    const feedClient = client as unknown as FeedClient;
    const { data, error } = await feedClient
      .from("posts")
      .select(POST_COLUMNS)
      .eq("cohort_id", cohort.id)
      .eq("author_id", subjectId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50);

    if (error) {
      return fallback;
    }

    const rows = (data ?? []) as FeedPostRow[];
    const results = await Promise.allSettled(
      rows.map((post) =>
        getVisiblePost({
          client: feedClient,
          postId: post.id,
          cohortId: cohort.id,
          viewerId,
          viewerIsAdmin: membership?.role === "admin",
        }),
      ),
    );

    const posts = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    return posts.length > 0 || rows.length === 0 ? posts : fallback;
  } catch {
    return fallback;
  }
}

async function fallbackPersonSummary(
  viewerId: string,
  subjectId: string,
  client: SupabaseClient<Database>,
): Promise<PersonSummaryDTO | null> {
  const { data: profileRow, error: profileError } = await client
    .from("profiles")
    .select("id, display_name, avatar_path, timezone")
    .eq("id", subjectId)
    .maybeSingle();

  if (profileError) {
    throw new ReadModelError("profiles", profileError);
  }

  if (!profileRow) {
    return null;
  }

  const scoring = createDayTrackingReadService(asDayTrackingClient(client));
  const score = await scoring.getDailyBoardScore(subjectId);
  const localDate =
    score.scoreDate || getMemberLocalDate(new Date(), profileRow.timezone);
  const currentDay = await scoring.getDayRollup(subjectId, localDate);
  const { data: cohort, error: cohortError } = await client
    .from("cohorts")
    .select("start_date")
    .eq("is_active", true)
    .maybeSingle();

  if (cohortError) {
    throw new ReadModelError("cohorts", cohortError);
  }

  const cohortStart = cohort?.start_date ?? COHORT_START_DATE;
  const calendar =
    localDate >= cohortStart
      ? await scoring.getCalendar(subjectId, cohortStart, localDate)
      : [];

  const profile = await hydrateMemberProfile(client, {
    id: profileRow.id,
    displayName: profileRow.display_name,
    avatarUrl: null,
  });

  const summary: PersonSummaryDTO = {
    profile,
    goalsAchievedToday: score.goalsAchievedToday,
    calendar,
    currentDay,
    achievements: [],
    posts: [],
    canEdit: viewerId === subjectId,
  };

  return {
    ...summary,
    posts: await readPublishedPersonPosts(
      client,
      viewerId,
      subjectId,
      summary.posts,
    ),
  };
}

export async function getPersonSummary(
  viewerId: string,
  subjectId: string,
  client?: SupabaseClient<Database>,
): Promise<PersonSummaryDTO | null> {
  const supabase = client ?? (await createSupabaseServerClient());

  try {
    const data = await readRpc(supabase, "get_person_summary", {
      viewer_id: viewerId,
      subject_id: subjectId,
    });
    const summary = normalizePersonPayload(data, viewerId, subjectId);
    if (!summary) {
      return null;
    }

    const posts = await readPublishedPersonPosts(
      supabase,
      viewerId,
      subjectId,
      summary.posts,
    );

    return {
      ...summary,
      profile: await hydrateMemberProfile(supabase, summary.profile),
      posts,
    };
  } catch (error) {
    if (error instanceof ReadModelError && error.missingFunction) {
      return fallbackPersonSummary(viewerId, subjectId, supabase);
    }

    throw error;
  }
}

export const getPerson = getPersonSummary;
