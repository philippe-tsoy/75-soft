import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PostStatus, RequiredGoalKey } from "@/lib/types";

export interface FeedPostRow {
  id: string;
  author_id: string;
  cohort_id: string;
  local_date: string;
  note: string | null;
  photo_path: string | null;
  status: PostStatus;
  client_operation_id: string;
  created_at: string;
  published_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface FeedPostInsert {
  id?: string;
  author_id: string;
  cohort_id: string;
  local_date: string;
  note?: string | null;
  photo_path?: string | null;
  status?: PostStatus;
  client_operation_id: string;
  created_at?: string;
  published_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface FeedPostUpdate {
  note?: string | null;
  photo_path?: string | null;
  status?: PostStatus;
  published_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface PostGoalEntryRow {
  id: string;
  post_id: string;
  required_goal_key: RequiredGoalKey | null;
  optional_goal_id: string | null;
  optional_goal_name: string | null;
  amount_int: number | null;
  diet_value: boolean | null;
  optional_value: number | string | null;
  optional_completed: boolean | null;
  created_at: string;
}

export interface PostGoalEntryInsert {
  id?: string;
  post_id: string;
  required_goal_key?: RequiredGoalKey | null;
  optional_goal_id?: string | null;
  optional_goal_name?: string | null;
  amount_int?: number | null;
  diet_value?: boolean | null;
  optional_value?: number | string | null;
  optional_completed?: boolean | null;
  created_at?: string;
}

export interface ReactionRow {
  post_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  updated_at: string;
}

export interface ReactionInsert {
  post_id: string;
  user_id: string;
  emoji: string;
  created_at?: string;
  updated_at?: string;
}

export interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  client_operation_id: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface CommentInsert {
  id?: string;
  post_id: string;
  author_id: string;
  body: string;
  client_operation_id?: string | null;
  created_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_path: string | null;
  timezone: string;
  reaction_palette: unknown;
}

export interface CohortRow {
  id: string;
  start_date: string;
}

export interface WaterContainerRow {
  id: string;
  owner_id: string;
  volume_ml: number;
  active?: boolean;
}

export interface OptionalGoalRow {
  id: string;
  owner_id: string;
  name: string;
  target_value: number | string | null;
  unit: string | null;
  active: boolean;
}

type TableDefinition<Row, Insert, Update = Partial<Insert>> = {
  Row: Row & Record<string, unknown>;
  Insert: Insert & Record<string, unknown>;
  Update: Update & Record<string, unknown>;
  Relationships: [];
};

export type FeedDatabase = {
  public: {
    Tables: {
      posts: TableDefinition<FeedPostRow, FeedPostInsert, FeedPostUpdate>;
      post_goal_entries: TableDefinition<
        PostGoalEntryRow,
        PostGoalEntryInsert,
        Partial<PostGoalEntryInsert>
      >;
      reactions: TableDefinition<
        ReactionRow,
        ReactionInsert,
        Partial<ReactionInsert>
      >;
      comments: TableDefinition<
        CommentRow,
        CommentInsert,
        Partial<CommentInsert>
      >;
      profiles: TableDefinition<
        ProfileRow,
        Partial<ProfileRow>,
        Partial<ProfileRow>
      >;
      cohorts: TableDefinition<
        CohortRow,
        Partial<CohortRow>,
        Partial<CohortRow>
      >;
      water_containers: TableDefinition<
        WaterContainerRow,
        Partial<WaterContainerRow>,
        Partial<WaterContainerRow>
      >;
      optional_goals: TableDefinition<
        OptionalGoalRow,
        Partial<OptionalGoalRow>,
        Partial<OptionalGoalRow>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};

export type FeedClient = SupabaseClient<FeedDatabase>;

export async function createFeedClient(): Promise<FeedClient> {
  const client = await createSupabaseServerClient();
  return client as unknown as FeedClient;
}

export const POST_COLUMNS =
  "id, author_id, cohort_id, local_date, note, photo_path, status, client_operation_id, created_at, published_at, deleted_at, deleted_by";

export const ENTRY_COLUMNS =
  "id, post_id, required_goal_key, optional_goal_id, optional_goal_name, amount_int, diet_value, optional_value, optional_completed, created_at";

export const COMMENT_COLUMNS =
  "id, post_id, author_id, body, client_operation_id, created_at, deleted_at, deleted_by";
