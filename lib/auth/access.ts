import type { User } from "@supabase/supabase-js";

import { HttpError } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MembershipRole } from "@/lib/types";

export interface MembershipContext {
  cohortId: string;
  userId: string;
  role: MembershipRole;
  joinLocalDate: string;
}

export interface AccessContext {
  user: User;
  membership: MembershipContext;
}

export async function getSessionUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
}

async function getActiveMembership(
  userId: string,
): Promise<MembershipContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: cohort, error: cohortError } = await supabase
    .from("cohorts")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (cohortError || !cohort) {
    return null;
  }

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("cohort_id, user_id, role, join_local_date")
    .eq("cohort_id", cohort.id)
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();

  if (error || !membership) {
    return null;
  }

  if (membership.role !== "member" && membership.role !== "admin") {
    return null;
  }

  return {
    cohortId: membership.cohort_id,
    userId: membership.user_id,
    role: membership.role,
    joinLocalDate: membership.join_local_date,
  };
}

export async function getAccessContext(): Promise<AccessContext | null> {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }

  const membership = await getActiveMembership(user.id);
  if (!membership) {
    return null;
  }

  return { user, membership };
}

export async function requireSession(): Promise<User> {
  const user = await getSessionUser();
  if (!user) {
    throw new HttpError(401, "AUTH_REQUIRED", "Authentication is required");
  }

  return user;
}

export async function requireActiveMember(): Promise<AccessContext> {
  const context = await getAccessContext();
  if (!context) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "An active group membership is required",
    );
  }

  return context;
}

export async function requireAdmin(): Promise<AccessContext> {
  const context = await requireActiveMember();
  if (context.membership.role !== "admin") {
    throw new HttpError(403, "FORBIDDEN", "Administrator access is required");
  }

  return context;
}

export async function isActiveMember(userId: string): Promise<boolean> {
  return (await getActiveMembership(userId)) !== null;
}
