import {
  READING_TARGET_PAGES,
  REQUIRED_GOALS,
  WATER_TARGET_ML,
  WORKOUT_TARGET_MINUTES,
} from "@/lib/config/75-soft";
import type {
  CommentDTO,
  PostDTO,
  PostGoalDTO,
  PostRequiredSnapshotDTO,
  ProfileDTO,
  ReactionSummaryDTO,
} from "@/lib/types";

import type { PostGoalEntryRow, ProfileRow, ReactionRow } from "./database";
import type { HydratedPost } from "./types";

const REQUIRED_GOAL_UNITS = {
  workout: "minutes",
  water: "ml",
  reading: "pages",
  diet: "attestation",
} as const;

function asNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toProfileDTO(
  row: Pick<ProfileRow, "id" | "display_name">,
  avatarUrl: string | null = null,
): ProfileDTO {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl,
  };
}

function requiredGoalIsMet(entry: PostGoalEntryRow): boolean {
  if (!entry.required_goal_key) {
    return false;
  }

  if (entry.required_goal_key === "diet") {
    return entry.diet_value === true;
  }

  const amount = entry.amount_int ?? 0;
  switch (entry.required_goal_key) {
    case "workout":
      return amount >= WORKOUT_TARGET_MINUTES;
    case "water":
      return amount >= WATER_TARGET_ML;
    case "reading":
      return amount >= READING_TARGET_PAGES;
  }
}

export function toPostGoalDTO(entry: PostGoalEntryRow): PostGoalDTO | null {
  if (entry.required_goal_key) {
    return {
      kind: "required",
      key: entry.required_goal_key,
      amount:
        entry.required_goal_key === "diet" ? null : (entry.amount_int ?? null),
      unit: REQUIRED_GOAL_UNITS[entry.required_goal_key],
      met: requiredGoalIsMet(entry),
    };
  }

  if (!entry.optional_goal_id) {
    return null;
  }

  return {
    kind: "optional",
    optionalGoalId: entry.optional_goal_id,
    name: entry.optional_goal_name ?? "Optional goal",
    value: asNumber(entry.optional_value),
    completed: entry.optional_completed,
  };
}

export function summarizeReactions(
  rows: readonly ReactionRow[],
  palette: readonly string[],
  viewerId: string,
): ReactionSummaryDTO[] {
  const counts = new Map<string, { count: number; reactedByViewer: boolean }>();

  for (const row of rows) {
    const existing = counts.get(row.emoji);
    if (existing) {
      existing.count += 1;
      existing.reactedByViewer ||= row.user_id === viewerId;
      continue;
    }

    counts.set(row.emoji, {
      count: 1,
      reactedByViewer: row.user_id === viewerId,
    });
  }

  const paletteOrder = new Map(palette.map((emoji, index) => [emoji, index]));
  return [...counts.entries()]
    .sort(([left], [right]) => {
      const leftIndex = paletteOrder.get(left);
      const rightIndex = paletteOrder.get(right);

      if (leftIndex !== undefined && rightIndex !== undefined) {
        return leftIndex - rightIndex;
      }
      if (leftIndex !== undefined) {
        return -1;
      }
      if (rightIndex !== undefined) {
        return 1;
      }
      return left.localeCompare(right);
    })
    .map(([emoji, summary]) => ({
      emoji,
      count: summary.count,
      reactedByViewer: summary.reactedByViewer,
    }));
}

export function toCommentDTO(
  row: {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
  },
  author: ProfileDTO,
  viewerId: string,
  viewerIsAdmin: boolean,
): CommentDTO {
  return {
    id: row.id,
    author,
    body: row.body,
    createdAt: row.created_at,
    canDelete: viewerIsAdmin || row.author_id === viewerId,
  };
}

function normalizeRequiredSnapshot(value: unknown): PostRequiredSnapshotDTO {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const goal = (key: string): Record<string, unknown> => {
    const entry = record[key];
    return entry && typeof entry === "object"
      ? (entry as Record<string, unknown>)
      : {};
  };
  const amount = (key: string): number => {
    const raw = goal(key).amount;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  };
  const met = (key: string): boolean => goal(key).met === true;

  return {
    workout: { amount: amount("workout"), met: met("workout") },
    water: { amount: amount("water"), met: met("water") },
    reading: { amount: amount("reading"), met: met("reading") },
    diet: { met: met("diet") },
  };
}

export function toPostDTO(
  hydrated: HydratedPost,
  viewerId: string,
  viewerIsAdmin: boolean,
  palette: readonly string[],
): PostDTO {
  const goals = hydrated.entries
    .map(toPostGoalDTO)
    .filter((goal): goal is PostGoalDTO => goal !== null);

  const comments = hydrated.comments
    .filter((comment) => comment.deleted_at === null)
    .map((comment) => {
      const author =
        hydrated.commentAuthors.get(comment.author_id) ??
        toProfileDTO({ id: comment.author_id, display_name: "Member" });
      return toCommentDTO(comment, author, viewerId, viewerIsAdmin);
    });

  return {
    id: hydrated.row.id,
    author: hydrated.author.dto,
    localDate: hydrated.row.local_date,
    createdAt: hydrated.row.created_at,
    goals,
    note: hydrated.row.note,
    photoUrl: hydrated.photoUrl,
    requiredSnapshot: normalizeRequiredSnapshot(hydrated.row.required_snapshot),
    teamId: hydrated.row.team_id,
    reactions: summarizeReactions(hydrated.reactions, palette, viewerId),
    comments,
    canDelete: viewerIsAdmin || hydrated.row.author_id === viewerId,
  };
}

export function requiredGoalLabel(key: keyof typeof REQUIRED_GOALS): string {
  return REQUIRED_GOALS[key].label;
}
