import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_REACTION_PALETTE, REQUIRED_GOALS } from "@/lib/config/75-soft";
import {
  buildPostPhotoPath,
  createMemberSignedUrl,
  deletePostPhoto,
} from "@/lib/storage";
import type { Database as CoreDatabase } from "@/lib/supabase/database.types";
import { HttpError } from "@/lib/http";
import { normalizeWaterAmount, reactionPaletteSchema } from "@/lib/validation";
import type { AchievementDTO, PostDTO, ProfileDTO } from "@/lib/types";

import {
  COMMENT_COLUMNS,
  ENTRY_COLUMNS,
  POST_COLUMNS,
  type CommentRow,
  type FeedClient,
  type FeedPostInsert,
  type FeedPostRow,
  type FeedPostUpdate,
  type OptionalGoalRow,
  type PostGoalEntryInsert,
  type PostGoalEntryRow,
  type ProfileRow,
  type ReactionRow,
  type WaterContainerRow,
} from "./database";
import { decodeFeedCursor, encodeFeedCursor, parseFeedLimit } from "./cursor";
import {
  parseCommentBody,
  getPhotoExtension,
  parseOptionalOperationId,
  parseReactionEmoji,
  parseReactionPalette,
  parseRequiredWholeAmount,
} from "./validation";
import type { PostGoalInput } from "./validation-types";
import { createFeedScoringAdapter } from "./scoring-adapter";
import { toCommentDTO, toPostDTO, toProfileDTO } from "./dto";
import type {
  CommentResult,
  CreatePostResult,
  DeletePostResult,
  FeedPage,
  FeedScoringAdapter,
  OwnedOptionalGoal,
  ReactionResult,
} from "./types";

const FALLBACK_PROFILE_NAME = "Member";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}

function throwDatabaseError(message: string, error?: unknown): never {
  void error;
  throw new HttpError(500, "INTERNAL_ERROR", message);
}

function parseNumeric(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function paletteFromProfile(profile: ProfileRow | null): string[] {
  const result = reactionPaletteSchema.safeParse({
    emoji: profile?.reaction_palette,
  });
  return result.success ? result.data.emoji : [...DEFAULT_REACTION_PALETTE];
}

function fallbackProfile(id: string): ProfileRow {
  return {
    id,
    display_name: FALLBACK_PROFILE_NAME,
    avatar_path: null,
    timezone: "UTC",
    reaction_palette: DEFAULT_REACTION_PALETTE,
  };
}

export async function getMemberProfile(
  client: FeedClient,
  userId: string,
): Promise<ProfileRow> {
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name, avatar_path, timezone, reaction_palette")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throwDatabaseError("Unable to load the member profile", error);
  }

  if (!data) {
    throw new HttpError(403, "FORBIDDEN", "A member profile is required");
  }

  return data;
}

async function getProfiles(
  client: FeedClient,
  ids: readonly string[],
): Promise<Map<string, ProfileRow>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from("profiles")
    .select("id, display_name, avatar_path, timezone, reaction_palette")
    .in("id", uniqueIds);

  if (error) {
    throwDatabaseError("Unable to load post authors", error);
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile]));
}

export async function listOwnedOptionalGoals(
  client: FeedClient,
  ownerId: string,
): Promise<OwnedOptionalGoal[]> {
  const { data, error } = await client
    .from("optional_goals")
    .select("id, owner_id, name, target_value, unit, active")
    .eq("owner_id", ownerId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) {
    return [];
  }

  return ((data ?? []) as OptionalGoalRow[]).map((goal) => ({
    id: goal.id,
    name: goal.name,
    targetValue: parseNumeric(goal.target_value),
    unit: goal.unit,
    active: goal.active,
    mode: goal.target_value === null ? "checkbox" : "numeric",
  }));
}

function invalidGoal(message: string): never {
  throw new HttpError(400, "VALIDATION_ERROR", message);
}

function amountUnitForGoal(key: "workout" | "water" | "reading"): string {
  return REQUIRED_GOALS[key].unit;
}

async function normalizePostGoals(
  client: FeedClient,
  authorId: string,
  goals: readonly PostGoalInput[],
): Promise<Omit<PostGoalEntryInsert, "post_id">[]> {
  const entries: Omit<PostGoalEntryInsert, "post_id">[] = [];

  for (const goal of goals) {
    if (goal.kind === "required") {
      if (goal.key === "diet") {
        if (
          goal.amount !== undefined ||
          goal.unit !== undefined ||
          goal.containerId !== undefined
        ) {
          invalidGoal("Diet posts do not accept an amount");
        }

        entries.push({
          required_goal_key: "diet",
          optional_goal_id: null,
          optional_goal_name: null,
          amount_int: null,
          diet_value: true,
          optional_value: null,
          optional_completed: null,
        });
        continue;
      }

      if (goal.key === "water") {
        if (
          goal.containerId !== undefined &&
          (goal.amount !== undefined || goal.unit !== undefined)
        ) {
          invalidGoal("Choose a water container or a custom amount");
        }

        let amountInt: number;
        if (goal.containerId !== undefined) {
          const { data, error } = await client
            .from("water_containers")
            .select("id, owner_id, volume_ml, active")
            .eq("id", goal.containerId)
            .eq("owner_id", authorId)
            .maybeSingle();

          if (error) {
            throwDatabaseError("Unable to resolve the water container", error);
          }

          const container = data as WaterContainerRow | null;
          if (!container || container.active === false) {
            throw new HttpError(
              422,
              "BUSINESS_RULE_VIOLATION",
              "That water container is not available",
            );
          }

          amountInt = parseRequiredWholeAmount(
            container.volume_ml,
            "container volume",
          );
        } else {
          if (
            goal.amount === undefined ||
            goal.unit === undefined ||
            (goal.unit !== "ml" && goal.unit !== "l")
          ) {
            invalidGoal("Water requires an amount and unit");
          }
          amountInt = normalizeWaterAmount(goal.amount, goal.unit);
        }

        entries.push({
          required_goal_key: "water",
          optional_goal_id: null,
          optional_goal_name: null,
          amount_int: amountInt,
          diet_value: null,
          optional_value: null,
          optional_completed: null,
        });
        continue;
      }

      if (
        goal.unit !== undefined &&
        goal.unit !== amountUnitForGoal(goal.key)
      ) {
        invalidGoal(`${goal.key} has an invalid unit`);
      }

      const amount = parseRequiredWholeAmount(
        goal.amount,
        `${goal.key} amount`,
      );
      entries.push({
        required_goal_key: goal.key,
        optional_goal_id: null,
        optional_goal_name: null,
        amount_int: amount,
        diet_value: null,
        optional_value: null,
        optional_completed: null,
      });
      continue;
    }

    const { data, error } = await client
      .from("optional_goals")
      .select("id, owner_id, name, target_value, unit, active")
      .eq("id", goal.optionalGoalId)
      .eq("owner_id", authorId)
      .maybeSingle();

    if (error) {
      throwDatabaseError("Unable to resolve the optional goal", error);
    }

    const optionalGoal = data as OptionalGoalRow | null;
    if (!optionalGoal) {
      throw new HttpError(
        422,
        "BUSINESS_RULE_VIOLATION",
        "The selected optional goal is not yours",
      );
    }
    if (!optionalGoal.active) {
      throw new HttpError(
        422,
        "BUSINESS_RULE_VIOLATION",
        "Archived optional goals cannot be posted",
      );
    }

    const isNumeric = optionalGoal.target_value !== null;
    if (isNumeric) {
      if (goal.value === undefined || goal.value === null) {
        invalidGoal("This optional goal requires a numeric value");
      }
      if (!Number.isFinite(goal.value) || goal.value <= 0) {
        invalidGoal("Optional goal values must be positive");
      }
    } else if (goal.completed === undefined || goal.completed === null) {
      invalidGoal("This optional goal requires a checkbox state");
    }

    entries.push({
      required_goal_key: null,
      optional_goal_id: optionalGoal.id,
      optional_goal_name: optionalGoal.name,
      amount_int: null,
      diet_value: null,
      optional_value: isNumeric ? goal.value : null,
      optional_completed: isNumeric ? null : goal.completed,
    });
  }

  if (entries.length === 0) {
    invalidGoal("Select at least one goal");
  }

  return entries;
}

function coreClient(client: FeedClient): SupabaseClient<CoreDatabase> {
  return client as unknown as SupabaseClient<CoreDatabase>;
}

async function signedPhotoUrl(
  client: FeedClient,
  photoPath: string | null,
): Promise<string | null> {
  if (!photoPath) {
    return null;
  }

  try {
    return await createMemberSignedUrl(coreClient(client), photoPath);
  } catch {
    return null;
  }
}

async function signedProfileDTO(
  client: FeedClient,
  profile: ProfileRow,
): Promise<ProfileDTO> {
  return toProfileDTO(
    profile,
    await signedPhotoUrl(client, profile.avatar_path),
  );
}

async function hydratePost(
  client: FeedClient,
  row: FeedPostRow,
): Promise<import("./types").HydratedPost> {
  const [entryResult, reactionResult, commentResult, authorResult] =
    await Promise.all([
      client
        .from("post_goal_entries")
        .select(ENTRY_COLUMNS)
        .eq("post_id", row.id)
        .order("created_at", { ascending: true }),
      client
        .from("reactions")
        .select("post_id, user_id, emoji, created_at, updated_at")
        .eq("post_id", row.id),
      client
        .from("comments")
        .select(COMMENT_COLUMNS)
        .eq("post_id", row.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      client
        .from("profiles")
        .select("id, display_name, avatar_path, timezone, reaction_palette")
        .eq("id", row.author_id)
        .maybeSingle(),
    ]);

  if (entryResult.error || reactionResult.error || commentResult.error) {
    throwDatabaseError("Unable to load this post");
  }

  const authorRow = authorResult.data ?? fallbackProfile(row.author_id);
  if (authorResult.error && !authorRow) {
    throwDatabaseError("Unable to load this post author", authorResult.error);
  }

  const comments = (commentResult.data ?? []) as CommentRow[];
  const commentAuthors = await getProfiles(
    client,
    comments.map((comment) => comment.author_id),
  );
  const [authorAvatarUrl, commentAuthorDTOs] = await Promise.all([
    signedPhotoUrl(client, (authorRow as ProfileRow).avatar_path),
    Promise.all(
      [...commentAuthors.entries()].map(
        async ([id, profile]) =>
          [id, await signedProfileDTO(client, profile)] as const,
      ),
    ),
  ]);

  return {
    row,
    entries: (entryResult.data ?? []) as PostGoalEntryRow[],
    reactions: (reactionResult.data ?? []) as ReactionRow[],
    comments,
    author: {
      row: authorRow as ProfileRow,
      dto: toProfileDTO(authorRow as ProfileRow, authorAvatarUrl),
    },
    commentAuthors: new Map(commentAuthorDTOs),
    photoUrl: await signedPhotoUrl(client, row.photo_path),
  };
}

async function postDTO(
  client: FeedClient,
  row: FeedPostRow,
  viewerId: string,
  viewerIsAdmin: boolean,
): Promise<PostDTO> {
  const hydrated = await hydratePost(client, row);
  const viewerProfile = await getMemberProfile(client, viewerId);
  return toPostDTO(
    hydrated,
    viewerId,
    viewerIsAdmin,
    paletteFromProfile(viewerProfile),
  );
}

async function findPostByOperation(
  client: FeedClient,
  authorId: string,
  clientOperationId: string,
): Promise<FeedPostRow | null> {
  const { data, error } = await client
    .from("posts")
    .select(POST_COLUMNS)
    .eq("author_id", authorId)
    .eq("client_operation_id", clientOperationId)
    .maybeSingle();

  if (error) {
    throwDatabaseError("Unable to check the post operation", error);
  }

  return data as FeedPostRow | null;
}

async function markPostFailed(
  client: FeedClient,
  postId: string,
): Promise<void> {
  await client
    .from("posts")
    .update({ status: "failed" } satisfies FeedPostUpdate)
    .eq("id", postId);
}

async function cleanupPostPhoto(
  client: FeedClient,
  path: string | null,
  postId: string,
): Promise<void> {
  if (!path) {
    return;
  }

  try {
    await deletePostPhoto(coreClient(client), path);
  } catch {
    // Storage cleanup is compensating; it must not turn a failed mutation into
    // a published post or expose the private path to the client.
    console.error("Unable to clean up post media", { postId });
  }
}

async function finishExistingPost(
  client: FeedClient,
  row: FeedPostRow,
  viewerId: string,
  viewerIsAdmin: boolean,
  scoring: FeedScoringAdapter,
  idempotent: boolean,
): Promise<CreatePostResult> {
  if (row.status !== "published") {
    throw new HttpError(
      409,
      "CONFLICT",
      "This post operation is still being processed",
    );
  }

  const [post, day] = await Promise.all([
    postDTO(client, row, viewerId, viewerIsAdmin),
    scoring.getDayRollup(row.author_id, row.local_date),
  ]);

  return {
    post,
    day,
    newAchievements: [],
    idempotent,
  };
}

export async function createPost(input: {
  client: FeedClient;
  authorId: string;
  viewerIsAdmin: boolean;
  cohortId: string;
  localDate: string;
  goals: readonly PostGoalInput[];
  note: string | null;
  photo: File;
  clientOperationId: string;
  scoring?: FeedScoringAdapter;
}): Promise<CreatePostResult> {
  const scoring = input.scoring ?? createFeedScoringAdapter(input.client);
  const existing = await findPostByOperation(
    input.client,
    input.authorId,
    input.clientOperationId,
  );

  if (existing) {
    return finishExistingPost(
      input.client,
      existing,
      input.authorId,
      input.viewerIsAdmin,
      scoring,
      true,
    );
  }

  const normalizedEntries = await normalizePostGoals(
    input.client,
    input.authorId,
    input.goals,
  );
  const postInsert: FeedPostInsert = {
    id: crypto.randomUUID(),
    author_id: input.authorId,
    cohort_id: input.cohortId,
    local_date: input.localDate,
    note: input.note,
    photo_path: null,
    status: "pending",
    client_operation_id: input.clientOperationId,
  };

  let post: FeedPostRow;
  try {
    const { data, error } = await input.client
      .from("posts")
      .insert(postInsert as FeedPostInsert & Record<string, unknown>)
      .select(POST_COLUMNS)
      .single();

    if (error || !data) {
      if (isUniqueViolation(error)) {
        const racedPost = await findPostByOperation(
          input.client,
          input.authorId,
          input.clientOperationId,
        );
        if (racedPost) {
          return finishExistingPost(
            input.client,
            racedPost,
            input.authorId,
            input.viewerIsAdmin,
            scoring,
            true,
          );
        }
      }
      throwDatabaseError("Unable to create the post", error);
    }
    post = data as FeedPostRow;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throwDatabaseError("Unable to create the post", error);
  }

  const entryRows = normalizedEntries.map((entry) => ({
    ...entry,
    post_id: post.id,
  }));
  const { error: entryError } = await input.client
    .from("post_goal_entries")
    .insert(entryRows);

  if (entryError) {
    await markPostFailed(input.client, post.id);
    throwDatabaseError("Unable to save the post goals", entryError);
  }

  let photoPath: string | null = null;
  try {
    const extension = getPhotoExtension(input.photo);
    photoPath = buildPostPhotoPath(
      input.authorId,
      post.id,
      crypto.randomUUID(),
      extension,
    );

    const { error: pathError } = await input.client
      .from("posts")
      .update({ photo_path: photoPath } satisfies FeedPostUpdate)
      .eq("id", post.id)
      .eq("status", "pending");
    if (pathError) {
      throw pathError;
    }

    const { error: uploadError } = await input.client.storage
      .from("post-photos")
      .upload(photoPath, input.photo, {
        contentType: input.photo.type,
        upsert: false,
      });
    if (uploadError) {
      throw uploadError;
    }

    const { data: publishedData, error: publishError } = await input.client
      .from("posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
      } satisfies FeedPostUpdate)
      .eq("id", post.id)
      .eq("status", "pending")
      .select(POST_COLUMNS)
      .single();

    if (publishError || !publishedData) {
      throw publishError ?? new Error("Post was not published");
    }

    post = publishedData as FeedPostRow;
  } catch {
    await markPostFailed(input.client, post.id);
    await cleanupPostPhoto(input.client, photoPath, post.id);
    throw new HttpError(500, "INTERNAL_ERROR", "Unable to publish the post");
  }

  let newAchievements: AchievementDTO[] = [];
  try {
    newAchievements = await scoring.afterPostPublished({
      postId: post.id,
      userId: input.authorId,
      localDate: post.local_date,
      hasPhoto: Boolean(post.photo_path),
    });
  } catch (error) {
    console.error("Achievement evaluation failed after post published", error);
    newAchievements = [];
  }

  const [postDTOValue, day] = await Promise.all([
    postDTO(input.client, post, input.authorId, input.viewerIsAdmin),
    scoring.getDayRollup(input.authorId, post.local_date),
  ]);

  return {
    post: postDTOValue,
    day,
    newAchievements,
    idempotent: false,
  };
}

export async function listFeed(input: {
  client: FeedClient;
  cohortId: string;
  viewerId: string;
  viewerIsAdmin: boolean;
  cursor: string | null;
  limit: number;
}): Promise<FeedPage> {
  const cursor = decodeFeedCursor(input.cursor);
  let query = input.client
    .from("posts")
    .select(POST_COLUMNS)
    .eq("cohort_id", input.cohortId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(input.limit + 1);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throwDatabaseError("Unable to load the feed", error);
  }

  const rows = (data ?? []) as FeedPostRow[];
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const posts = await Promise.all(
    pageRows.map((row) =>
      postDTO(input.client, row, input.viewerId, input.viewerIsAdmin),
    ),
  );

  return {
    data: posts,
    nextCursor: hasMore
      ? encodeFeedCursor({
          createdAt: pageRows[pageRows.length - 1].created_at,
          id: pageRows[pageRows.length - 1].id,
        })
      : null,
  };
}

export async function getVisiblePost(input: {
  client: FeedClient;
  postId: string;
  cohortId: string;
  viewerId: string;
  viewerIsAdmin: boolean;
}): Promise<PostDTO> {
  const { data, error } = await input.client
    .from("posts")
    .select(POST_COLUMNS)
    .eq("id", input.postId)
    .eq("cohort_id", input.cohortId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throwDatabaseError("Unable to load the post", error);
  }
  if (!data) {
    throw new HttpError(404, "NOT_FOUND", "Post was not found");
  }

  return postDTO(
    input.client,
    data as FeedPostRow,
    input.viewerId,
    input.viewerIsAdmin,
  );
}

export async function deletePost(input: {
  client: FeedClient;
  postId: string;
  actorId: string;
  actorIsAdmin: boolean;
  cohortId: string;
  scoring?: FeedScoringAdapter;
}): Promise<DeletePostResult> {
  const scoring = input.scoring ?? createFeedScoringAdapter(input.client);
  const { data, error } = await input.client
    .from("posts")
    .select(POST_COLUMNS)
    .eq("id", input.postId)
    .eq("cohort_id", input.cohortId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throwDatabaseError("Unable to load the post", error);
  }
  if (!data) {
    throw new HttpError(404, "NOT_FOUND", "Post was not found");
  }

  const post = data as FeedPostRow;
  if (!input.actorIsAdmin && post.author_id !== input.actorId) {
    throw new HttpError(403, "FORBIDDEN", "You cannot delete this post");
  }

  const deletedAt = new Date().toISOString();
  const { error: deleteError } = await input.client
    .from("posts")
    .update({
      status: "deleted",
      deleted_at: deletedAt,
      deleted_by: input.actorId,
    } satisfies FeedPostUpdate)
    .eq("id", post.id)
    .eq("status", "published");

  if (deleteError) {
    throwDatabaseError("Unable to delete the post", deleteError);
  }

  await cleanupPostPhoto(input.client, post.photo_path, post.id);
  try {
    await scoring.afterPostDeleted({
      postId: post.id,
      userId: post.author_id,
      localDate: post.local_date,
    });
  } catch {
    // The W2 rollup is derived from published rows; a hook failure does not
    // make a successfully soft-deleted post visible again.
  }

  return {
    day:
      post.author_id === input.actorId || input.actorIsAdmin
        ? await scoring.getDayRollup(post.author_id, post.local_date)
        : null,
  };
}

async function ensurePublishedPost(
  client: FeedClient,
  postId: string,
): Promise<void> {
  const { data, error } = await client
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throwDatabaseError("Unable to verify the post", error);
  }
  if (!data) {
    throw new HttpError(404, "NOT_FOUND", "Post was not found");
  }
}

export async function setReaction(input: {
  client: FeedClient;
  postId: string;
  userId: string;
  emoji: unknown;
}): Promise<ReactionResult> {
  await ensurePublishedPost(input.client, input.postId);
  const emoji = parseReactionEmoji(input.emoji);
  const profile = await getMemberProfile(input.client, input.userId);
  if (!paletteFromProfile(profile).includes(emoji)) {
    throw new HttpError(
      422,
      "BUSINESS_RULE_VIOLATION",
      "Choose an emoji from your current reaction palette",
    );
  }

  const { error } = await input.client.from("reactions").upsert(
    {
      post_id: input.postId,
      user_id: input.userId,
      emoji,
    },
    { onConflict: "post_id,user_id" },
  );
  if (error) {
    throwDatabaseError("Unable to save the reaction", error);
  }

  return { postId: input.postId, emoji };
}

export async function removeReaction(input: {
  client: FeedClient;
  postId: string;
  userId: string;
}): Promise<void> {
  await ensurePublishedPost(input.client, input.postId);
  const { error } = await input.client
    .from("reactions")
    .delete()
    .eq("post_id", input.postId)
    .eq("user_id", input.userId);

  if (error) {
    throwDatabaseError("Unable to remove the reaction", error);
  }
}

export async function getReactionPalette(
  client: FeedClient,
  userId: string,
): Promise<string[]> {
  const profile = await getMemberProfile(client, userId);
  return paletteFromProfile(profile);
}

export async function updateReactionPalette(input: {
  client: FeedClient;
  userId: string;
  value: unknown;
}): Promise<string[]> {
  const emoji = parseReactionPalette(input.value);
  const { error } = await input.client
    .from("profiles")
    .update({ reaction_palette: emoji })
    .eq("id", input.userId);

  if (error) {
    throwDatabaseError("Unable to update the reaction palette", error);
  }

  return emoji;
}

async function getComment(
  client: FeedClient,
  commentId: string,
): Promise<CommentRow> {
  const { data, error } = await client
    .from("comments")
    .select(COMMENT_COLUMNS)
    .eq("id", commentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throwDatabaseError("Unable to load the comment", error);
  }
  if (!data) {
    throw new HttpError(404, "NOT_FOUND", "Comment was not found");
  }

  return data as CommentRow;
}

export async function createComment(input: {
  client: FeedClient;
  postId: string;
  authorId: string;
  authorIsAdmin: boolean;
  body: unknown;
  clientOperationId?: string | null;
}): Promise<CommentResult> {
  await ensurePublishedPost(input.client, input.postId);
  const body = parseCommentBody(input.body);

  if (input.clientOperationId) {
    const { data, error } = await input.client
      .from("comments")
      .select(COMMENT_COLUMNS)
      .eq("author_id", input.authorId)
      .eq("client_operation_id", input.clientOperationId)
      .maybeSingle();
    if (error) {
      throwDatabaseError("Unable to check the comment operation", error);
    }
    if (data) {
      const profile = await getMemberProfile(input.client, input.authorId);
      return {
        comment: toCommentDTO(
          data as CommentRow,
          toProfileDTO(profile),
          input.authorId,
          input.authorIsAdmin,
        ),
        idempotent: true,
      };
    }
  }

  const { data, error } = await input.client
    .from("comments")
    .insert({
      post_id: input.postId,
      author_id: input.authorId,
      body,
      client_operation_id: input.clientOperationId ?? null,
    })
    .select(COMMENT_COLUMNS)
    .single();

  if (error || !data) {
    if (input.clientOperationId && isUniqueViolation(error)) {
      const existing = await getCommentByOperation(
        input.client,
        input.authorId,
        input.clientOperationId,
      );
      if (existing) {
        const profile = await getMemberProfile(input.client, input.authorId);
        return {
          comment: toCommentDTO(
            existing,
            toProfileDTO(profile),
            input.authorId,
            input.authorIsAdmin,
          ),
          idempotent: true,
        };
      }
    }
    throwDatabaseError("Unable to create the comment", error);
  }

  const profile = await getMemberProfile(input.client, input.authorId);
  return {
    comment: toCommentDTO(
      data as CommentRow,
      toProfileDTO(profile),
      input.authorId,
      input.authorIsAdmin,
    ),
    idempotent: false,
  };
}

async function getCommentByOperation(
  client: FeedClient,
  authorId: string,
  operationId: string,
): Promise<CommentRow | null> {
  const { data, error } = await client
    .from("comments")
    .select(COMMENT_COLUMNS)
    .eq("author_id", authorId)
    .eq("client_operation_id", operationId)
    .maybeSingle();
  if (error) {
    throwDatabaseError("Unable to check the comment operation", error);
  }
  return (data as CommentRow | null) ?? null;
}

export async function deleteComment(input: {
  client: FeedClient;
  commentId: string;
  actorId: string;
  actorIsAdmin: boolean;
}): Promise<void> {
  const comment = await getComment(input.client, input.commentId);
  if (!input.actorIsAdmin && comment.author_id !== input.actorId) {
    throw new HttpError(403, "FORBIDDEN", "You cannot delete this comment");
  }

  const { error } = await input.client
    .from("comments")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: input.actorId,
    })
    .eq("id", comment.id)
    .is("deleted_at", null);
  if (error) {
    throwDatabaseError("Unable to delete the comment", error);
  }
}

export function parseFeedRequest(
  cursorValue: string | null,
  limitValue: string | null,
): { cursor: string | null; limit: number } {
  decodeFeedCursor(cursorValue);
  return {
    cursor: cursorValue,
    limit: parseFeedLimit(limitValue),
  };
}

export { parseOptionalOperationId };
