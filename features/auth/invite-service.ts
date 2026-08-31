import "server-only";

import { randomUUID } from "node:crypto";

import { HttpError } from "@/lib/http";
import { getMemberLocalDate } from "@/lib/dates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { getServerEnv } from "@/lib/config/env";

import {
  createInviteIntentPayload,
  hashEmail,
  hashInviteCode,
  hashNonce,
  isInviteIntentRecordUsable,
  signInviteIntent,
  verifyInviteIntent,
  type SignedInviteIntentPayload,
} from "./invite-intent";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface ActiveInvite {
  id: string;
  cohortId: string;
  codeDigest: string;
}

export interface ValidInviteIntent {
  id: string;
  inviteDigest: string;
  nonce: string;
  expiresAt: string;
  payload: SignedInviteIntentPayload;
  invite: ActiveInvite;
}

interface SignupIntentRow {
  id: string;
  invite_digest: string;
  auth_user_id: string | null;
  email_digest: string | null;
  nonce_digest: string;
  expires_at: string;
  consumed_at: string | null;
  invalidated_at?: string | null;
  created_at: string;
}

function toActiveInvite(row: {
  id: string;
  cohort_id: string;
  code_digest: string;
}): ActiveInvite {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    codeDigest: row.code_digest,
  };
}

async function getActiveInviteByDigest(
  client: AdminClient,
  digest: string,
): Promise<ActiveInvite | null> {
  const { data: invite, error: inviteError } = await client
    .from("invite_codes")
    .select("id, cohort_id, code_digest")
    .eq("code_digest", digest)
    .eq("is_active", true)
    .maybeSingle();

  if (inviteError) {
    throw new Error("Unable to validate invite");
  }

  if (!invite) {
    return null;
  }

  const { data: cohort, error: cohortError } = await client
    .from("cohorts")
    .select("id")
    .eq("id", invite.cohort_id)
    .eq("is_active", true)
    .maybeSingle();

  if (cohortError) {
    throw new Error("Unable to validate invite");
  }

  return cohort ? toActiveInvite(invite) : null;
}

export async function findActiveInvite(
  code: string,
  client = createSupabaseAdminClient(),
): Promise<ActiveInvite | null> {
  return getActiveInviteByDigest(client, hashInviteCode(code));
}

export async function createInviteIntent(
  code: string,
  now = new Date(),
  client = createSupabaseAdminClient(),
): Promise<{
  token: string;
  expiresAt: string;
  intentId: string;
} | null> {
  const invite = await findActiveInvite(code, client);
  if (!invite) {
    return null;
  }

  const intentId = randomUUID();
  const payload = createInviteIntentPayload({
    intentId,
    inviteCodeHash: invite.codeDigest,
    now,
  });
  const { INVITE_INTENT_SECRET } = getServerEnv();

  const { error } = await client.from("signup_intents").insert({
    id: intentId,
    invite_digest: invite.codeDigest,
    nonce_digest: hashNonce(payload.nonce),
    expires_at: new Date(payload.exp).toISOString(),
  });

  if (error) {
    throw new Error("Unable to create invite intent");
  }

  return {
    token: signInviteIntent(payload, INVITE_INTENT_SECRET),
    expiresAt: new Date(payload.exp).toISOString(),
    intentId,
  };
}

function isFreshDate(value: string, now: number): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= now;
}

async function getIntentRow(
  client: AdminClient,
  intentId: string,
): Promise<SignupIntentRow | null> {
  const { data, error } = await client
    .from("signup_intents")
    .select("*")
    .eq("id", intentId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to read invite intent");
  }

  return data as unknown as SignupIntentRow | null;
}

export async function findValidInviteIntent(
  token: string | null | undefined,
  client = createSupabaseAdminClient(),
  now = Date.now(),
  expectedUserId?: string,
): Promise<ValidInviteIntent | null> {
  if (!token) {
    return null;
  }

  const { INVITE_INTENT_SECRET } = getServerEnv();
  const payload = verifyInviteIntent(token, INVITE_INTENT_SECRET, now);
  if (!payload) {
    return null;
  }

  const record = await getIntentRow(client, payload.intentId);
  if (
    !record ||
    (record.auth_user_id !== null && record.auth_user_id !== expectedUserId) ||
    !isInviteIntentRecordUsable(record, payload, now)
  ) {
    return null;
  }

  const invite = await getActiveInviteByDigest(client, payload.inviteCodeHash);
  if (!invite) {
    return null;
  }

  return {
    id: record.id,
    inviteDigest: record.invite_digest,
    nonce: payload.nonce,
    expiresAt: record.expires_at,
    payload,
    invite,
  };
}

export async function findPendingInviteIntentForUser(
  userId: string,
  client = createSupabaseAdminClient(),
  now = Date.now(),
): Promise<ValidInviteIntent | null> {
  const { data, error } = await client
    .from("signup_intents")
    .select("*")
    .eq("auth_user_id", userId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to read invite intent");
  }

  const row = data as unknown as SignupIntentRow | null;
  if (!row || row.invalidated_at != null || !isFreshDate(row.expires_at, now)) {
    return null;
  }

  const invite = await getActiveInviteByDigest(client, row.invite_digest);
  if (!invite) {
    return null;
  }

  const payload = {
    v: 1 as const,
    purpose: "invite" as const,
    intentId: row.id,
    inviteCodeHash: row.invite_digest,
    createdAt: row.created_at,
    nonce: row.nonce_digest,
    exp: Date.parse(row.expires_at),
  };

  return {
    id: row.id,
    inviteDigest: row.invite_digest,
    nonce: row.nonce_digest,
    expiresAt: row.expires_at,
    payload,
    invite,
  };
}

export async function bindInviteIntentToUser(
  intentId: string,
  userId: string,
  email: string | null,
  client = createSupabaseAdminClient(),
): Promise<void> {
  const { data: existingData, error: readError } = await client
    .from("signup_intents")
    .select("*")
    .eq("id", intentId)
    .maybeSingle();
  const existing = existingData as unknown as SignupIntentRow | null;

  if (
    readError ||
    !existing ||
    existing.consumed_at ||
    existing.invalidated_at
  ) {
    throw new HttpError(
      409,
      "CONFLICT",
      "This invite attempt is no longer valid",
    );
  }

  if (existing.auth_user_id && existing.auth_user_id !== userId) {
    throw new HttpError(
      409,
      "CONFLICT",
      "This invite attempt is no longer valid",
    );
  }

  if (existing.auth_user_id === userId) {
    return;
  }

  const { data: claimed, error: claimError } = await client
    .from("signup_intents")
    .update({
      auth_user_id: userId,
      email_digest: email ? hashEmail(email) : null,
    })
    .eq("id", intentId)
    .is("auth_user_id", null)
    .is("consumed_at", null)
    .filter("invalidated_at", "is", "null");

  if (claimError) {
    throw new Error("Unable to bind invite intent");
  }

  if (claimed) {
    return;
  }

  const { data: afterClaimData, error: verifyError } = await client
    .from("signup_intents")
    .select("*")
    .eq("id", intentId)
    .maybeSingle();
  const afterClaim = afterClaimData as unknown as SignupIntentRow | null;

  if (
    verifyError ||
    !afterClaim ||
    afterClaim.auth_user_id !== userId ||
    afterClaim.consumed_at ||
    afterClaim.invalidated_at
  ) {
    throw new HttpError(
      409,
      "CONFLICT",
      "This invite attempt is no longer valid",
    );
  }
}

export async function markInviteIntentConsumed(
  intentId: string,
  userId: string,
  client = createSupabaseAdminClient(),
): Promise<void> {
  const { data, error } = await client
    .from("signup_intents")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", intentId)
    .eq("auth_user_id", userId)
    .is("consumed_at", null)
    .filter("invalidated_at", "is", "null")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(
      409,
      "CONFLICT",
      "This invite attempt is no longer valid",
    );
  }
}

export function getJoinLocalDate(timezone: string, now = new Date()): string {
  return getMemberLocalDate(now, timezone);
}

export type { Database };
