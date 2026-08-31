import "server-only";

import { createFeedScoringAdapter, type FeedClient } from "@/features/feed";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/access";
import { HttpError } from "@/lib/http";

import {
  createAdminRequestClient,
  getActiveAdminCohort,
  throwAdminDatabaseError,
  unwrapAdminRpcResult,
  type AdminClient,
  type AdminInviteRow,
  type AdminInvalidationRpc,
  type AdminMembershipRow,
  type AdminProfileRow,
} from "./database";
import {
  buildInviteLink,
  createInviteRecord,
  decryptInviteCode,
  getInviteSecret,
} from "./invite";
import {
  adminInvalidationInputSchema,
  adminUserIdSchema,
  normalizeAdminReason,
} from "./validation";
import {
  ADMIN_INVALIDATION_KIND,
  INVALIDATED_GOAL_STATES,
  type AdminAuditEntryDTO,
  type AdminDashboardDTO,
  type AdminInvalidationDTO,
  type AdminInvalidationInput,
  type AdminInviteDTO,
  type AdminMemberDTO,
  type AdminModerationDTO,
  type AdminRemovalDTO,
} from "./types";
import type { MembershipRole } from "@/lib/types";

const ADMIN_AUDIT_LIMIT = 50;

function validationError(
  message: string,
  details?: Record<string, unknown>,
): HttpError {
  return new HttpError(400, "VALIDATION_ERROR", message, details);
}

function requireUuid(value: string, fieldName: string): string {
  const result = adminUserIdSchema.safeParse(value);
  if (!result.success) {
    throw validationError(`${fieldName} must be a valid UUID`, {
      field: fieldName,
    });
  }

  return result.data;
}

function parseInvalidationInput(
  input: AdminInvalidationInput,
): AdminInvalidationInput {
  const result = adminInvalidationInputSchema.safeParse(input);
  if (!result.success) {
    throw validationError("The invalidation request is invalid", {
      issues: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  return {
    localDate: result.data.localDate,
    reason: normalizeAdminReason(result.data.reason),
  };
}

function toInviteDTO(
  row: AdminInviteRow,
  code: string,
  origin?: string,
): AdminInviteDTO {
  return {
    id: row.id,
    code,
    codeHint: `••••${code.slice(-4)}`,
    inviteLink: buildInviteLink(code, origin),
    createdAt: row.created_at,
  };
}

async function getInviteWithClient(
  client: AdminClient,
  origin?: string,
): Promise<AdminInviteDTO | null> {
  const cohort = await getActiveAdminCohort(client);
  const { data, error } = await client
    .from("invite_codes")
    .select(
      "id, cohort_id, code_digest, code_ciphertext, code_hint, is_active, created_by, created_at, rotated_at",
    )
    .eq("cohort_id", cohort.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throwAdminDatabaseError(error, "Unable to load the active invite");
  }

  if (!data) {
    return null;
  }

  let code: string;
  try {
    code = decryptInviteCode(data.code_ciphertext);
  } catch {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      "The active invite cannot be displayed",
    );
  }

  return toInviteDTO(data, code, origin);
}

async function listMembersWithClient(
  client: AdminClient,
): Promise<AdminMemberDTO[]> {
  const cohort = await getActiveAdminCohort(client);
  const { data: memberships, error: membershipError } = await client
    .from("memberships")
    .select(
      "cohort_id, user_id, role, joined_at, join_local_date, removed_at, removed_by",
    )
    .eq("cohort_id", cohort.id)
    .is("removed_at", null)
    .order("joined_at", { ascending: true });

  if (membershipError) {
    throwAdminDatabaseError(membershipError, "Unable to load active members");
  }

  const activeMemberships = (memberships ?? []) as AdminMembershipRow[];
  if (activeMemberships.length === 0) {
    return [];
  }

  const userIds = activeMemberships.map((membership) => membership.user_id);
  const { data: profiles, error: profileError } = await client
    .from("profiles")
    .select("id, display_name, avatar_path, timezone")
    .in("id", userIds);

  if (profileError) {
    throwAdminDatabaseError(profileError, "Unable to load member profiles");
  }

  const profilesById = new Map(
    ((profiles ?? []) as AdminProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  return activeMemberships.flatMap((membership) => {
    const profile = profilesById.get(membership.user_id);
    if (!profile) {
      return [];
    }

    return [
      {
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: null,
        timezone: profile.timezone,
        role: membership.role as MembershipRole,
        joinedAt: membership.joined_at,
        joinLocalDate: membership.join_local_date,
      },
    ];
  });
}

async function listAuditWithClient(
  client: AdminClient,
): Promise<AdminAuditEntryDTO[]> {
  const { data, error } = await client
    .from("audit_log")
    .select("id, action, target_type, target_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(ADMIN_AUDIT_LIMIT);

  if (error) {
    throwAdminDatabaseError(error, "Unable to load administrator activity");
  }

  return (data ?? []).map((entry) => ({
    id: entry.id,
    action: entry.action,
    targetType: entry.target_type,
    targetId: entry.target_id,
    createdAt: entry.created_at,
  }));
}

export async function getAdminInvite(
  origin?: string,
): Promise<AdminInviteDTO | null> {
  await requireAdmin();
  const client = await createAdminRequestClient();
  return getInviteWithClient(client, origin);
}

export async function listAdminMembers(): Promise<AdminMemberDTO[]> {
  await requireAdmin();
  const client = await createAdminRequestClient();
  return listMembersWithClient(client);
}

export async function listAdminAudit(): Promise<AdminAuditEntryDTO[]> {
  await requireAdmin();
  const client = await createAdminRequestClient();
  return listAuditWithClient(client);
}

export async function getAdminDashboard(
  origin?: string,
): Promise<AdminDashboardDTO> {
  await requireAdmin();
  const client = await createAdminRequestClient();
  const [invite, members, audit] = await Promise.all([
    getInviteWithClient(client, origin),
    listMembersWithClient(client),
    listAuditWithClient(client),
  ]);

  return { invite, members, audit };
}

export async function rotateAdminInvite(
  origin?: string,
): Promise<AdminInviteDTO> {
  await requireAdmin();
  const client = await createAdminRequestClient();
  const secret = getInviteSecret();
  const record = createInviteRecord(secret);
  const { data, error } = await client.rpc("admin_rotate_invite", {
    p_code_digest: record.codeDigest,
    p_code_ciphertext: record.codeCiphertext,
    p_code_hint: record.codeHint,
  });

  if (error) {
    throwAdminDatabaseError(error, "Unable to rotate the invite");
  }

  const result = unwrapAdminRpcResult(data);
  if (!result) {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      "The invite rotation did not return an invite",
    );
  }

  return {
    id: result.id,
    code: record.code,
    codeHint: record.codeHint,
    inviteLink: buildInviteLink(record.code, origin),
    createdAt: result.createdAt,
  };
}

export async function invalidateAdminMemberDay(
  userId: string,
  input: AdminInvalidationInput,
): Promise<AdminInvalidationDTO> {
  await requireAdmin();
  const targetUserId = requireUuid(userId, "userId");
  const parsedInput = parseInvalidationInput(input);
  const client = await createAdminRequestClient();
  const { data, error } = await client.rpc("admin_invalidate_day", {
    p_user_id: targetUserId,
    p_local_date: parsedInput.localDate,
    p_reason: parsedInput.reason ?? null,
  });

  if (error) {
    throwAdminDatabaseError(error, "Unable to invalidate the member day");
  }

  const result = unwrapAdminRpcResult(
    data as AdminInvalidationRpc | AdminInvalidationRpc[] | null,
  );
  if (!result) {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      "The day invalidation did not return an override",
    );
  }

  return {
    userId: result.userId,
    localDate: result.localDate,
    kind: ADMIN_INVALIDATION_KIND,
    reason: result.reason,
    createdBy: result.createdBy,
    createdAt: result.createdAt,
    forcedGoalStates: { ...INVALIDATED_GOAL_STATES },
    dailyBoardScore: 0,
    postsRemainVisible: true,
  };
}

export async function removeAdminMember(
  userId: string,
): Promise<AdminRemovalDTO> {
  await requireAdmin();
  const targetUserId = requireUuid(userId, "userId");
  const client = await createAdminRequestClient();
  const { data, error } = await client.rpc("admin_remove_member", {
    p_user_id: targetUserId,
  });

  if (error) {
    throwAdminDatabaseError(error, "Unable to remove the member");
  }

  const result = unwrapAdminRpcResult(data);
  if (!result) {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      "The member removal did not return a membership",
    );
  }

  return {
    userId: result.userId,
    removedAt: result.removedAt,
    removedBy: result.removedBy,
  };
}

async function deleteStoredPostPhoto(path: string | null): Promise<boolean> {
  if (!path) {
    return false;
  }

  try {
    const { error } = await createSupabaseAdminClient()
      .storage.from("post-photos")
      .remove([path]);
    return Boolean(error);
  } catch {
    return true;
  }
}

export async function deleteAdminPost(
  postId: string,
): Promise<AdminModerationDTO> {
  await requireAdmin();
  const targetPostId = requireUuid(postId, "postId");
  const client = await createAdminRequestClient();
  const { data, error } = await client.rpc("admin_delete_post", {
    p_post_id: targetPostId,
  });

  if (error) {
    throwAdminDatabaseError(error, "Unable to delete the post");
  }

  const result = unwrapAdminRpcResult(data);
  if (!result) {
    throw new HttpError(404, "NOT_FOUND", "The post was not found");
  }

  const mediaCleanupPending = result.deleted
    ? await deleteStoredPostPhoto(result.photoPath)
    : false;
  const day = result.deleted
    ? await createFeedScoringAdapter(
        client as unknown as FeedClient,
      ).getDayRollup(result.authorId, result.localDate)
    : null;

  return {
    id: result.id,
    deleted: result.deleted,
    day,
    ...(mediaCleanupPending ? { mediaCleanupPending: true } : {}),
  };
}

export async function deleteAdminComment(
  commentId: string,
): Promise<AdminModerationDTO> {
  await requireAdmin();
  const targetCommentId = requireUuid(commentId, "commentId");
  const client = await createAdminRequestClient();
  const { data, error } = await client.rpc("admin_delete_comment", {
    p_comment_id: targetCommentId,
  });

  if (error) {
    throwAdminDatabaseError(error, "Unable to delete the comment");
  }

  const result = unwrapAdminRpcResult(data);
  if (!result) {
    throw new HttpError(404, "NOT_FOUND", "The comment was not found");
  }

  return {
    id: result.id,
    deleted: result.deleted,
  };
}
