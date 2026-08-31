import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { HttpError } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export interface AdminCohortRow {
  id: string;
  start_date: string;
}

export interface AdminProfileRow {
  id: string;
  display_name: string;
  avatar_path: string | null;
  timezone: string;
}

export interface AdminMembershipRow {
  cohort_id: string;
  user_id: string;
  role: "member" | "admin";
  joined_at: string;
  join_local_date: string;
  removed_at: string | null;
  removed_by: string | null;
}

export interface AdminInviteRow {
  id: string;
  cohort_id: string;
  code_digest: string;
  code_ciphertext: string;
  code_hint: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  rotated_at: string | null;
}

export interface AdminDayOverrideRow {
  user_id: string;
  local_date: string;
  kind: "invalidated";
  reason: string | null;
  created_by: string;
  created_at: string;
}

export interface AdminAuditLogRow {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Json;
  created_at: string;
}

interface AdminTable<Row> {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
}

interface AdminRpc<Args, Returns> {
  Args: Args;
  Returns: Returns;
}

export interface AdminInviteRotationRpc {
  id: string;
  createdAt: string;
  previousInviteId: string | null;
}

export interface AdminInvalidationRpc {
  userId: string;
  localDate: string;
  kind: "invalidated";
  reason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AdminRemovalRpc {
  userId: string;
  removedAt: string;
  removedBy: string;
}

export interface AdminPostDeletionRpc {
  id: string;
  deleted: boolean;
  authorId: string;
  localDate: string;
  photoPath: string | null;
}

export interface AdminCommentDeletionRpc {
  id: string;
  deleted: boolean;
}

interface AdminDatabase {
  public: {
    Tables: {
      cohorts: AdminTable<AdminCohortRow>;
      profiles: AdminTable<AdminProfileRow>;
      memberships: AdminTable<AdminMembershipRow>;
      invite_codes: AdminTable<AdminInviteRow>;
      signup_intents: AdminTable<{
        id: string;
        invite_digest: string;
        invalidated_at: string | null;
      }>;
      day_overrides: AdminTable<AdminDayOverrideRow>;
      audit_log: AdminTable<AdminAuditLogRow>;
      posts: AdminTable<{
        id: string;
        author_id: string;
        local_date: string;
        photo_path: string | null;
        status: string;
        deleted_at: string | null;
        deleted_by: string | null;
      }>;
      comments: AdminTable<{
        id: string;
        deleted_at: string | null;
        deleted_by: string | null;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      admin_rotate_invite: AdminRpc<
        {
          p_code_digest: string;
          p_code_ciphertext: string;
          p_code_hint: string;
        },
        AdminInviteRotationRpc
      >;
      admin_invalidate_day: AdminRpc<
        {
          p_user_id: string;
          p_local_date: string;
          p_reason: string | null;
        },
        AdminInvalidationRpc
      >;
      admin_remove_member: AdminRpc<{ p_user_id: string }, AdminRemovalRpc>;
      admin_delete_post: AdminRpc<{ p_post_id: string }, AdminPostDeletionRpc>;
      admin_delete_comment: AdminRpc<
        { p_comment_id: string },
        AdminCommentDeletionRpc
      >;
    };
    Enums: {
      membership_role: "member" | "admin";
    };
    CompositeTypes: Record<string, never>;
  };
}

// The frozen W0 generated schema intentionally stops at core tables. Admin
// consumes later domain tables through the 0007 RPC boundary, so keep this
// request client unparameterized instead of widening the shared database types.
export type AdminClient = SupabaseClient;

export async function createAdminRequestClient(): Promise<AdminClient> {
  const client = await createSupabaseServerClient();
  return client as unknown as AdminClient;
}

export async function getActiveAdminCohort(
  client: AdminClient,
): Promise<AdminCohortRow> {
  const { data, error } = await client
    .from("cohorts")
    .select("id, start_date")
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throwAdminDatabaseError(error, "Unable to load the active cohort");
  }

  if (!data) {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      "The active cohort is not configured",
    );
  }

  return data;
}

export function unwrapAdminRpcResult<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export function throwAdminDatabaseError(
  error: unknown,
  fallbackMessage = "Unable to complete the administrator action",
): never {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : null;

  if (code === "42501") {
    throw new HttpError(403, "FORBIDDEN", "Administrator access is required");
  }

  if (code === "P0002" || code === "23503" || code === "PGRST116") {
    throw new HttpError(
      404,
      "NOT_FOUND",
      "The requested resource was not found",
    );
  }

  if (code === "22023" || code === "22007" || code === "23514") {
    throw new HttpError(
      422,
      "BUSINESS_RULE_VIOLATION",
      "The administrator action is not allowed",
    );
  }

  throw new HttpError(500, "INTERNAL_ERROR", fallbackMessage);
}
