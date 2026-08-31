import "server-only";

import type { User } from "@supabase/supabase-js";

import { HttpError } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Tables } from "@/lib/supabase/database.types";
import type { ProfileDTO } from "@/lib/types";

import {
  bindInviteIntentToUser,
  findPendingInviteIntentForUser,
  findValidInviteIntent,
  getJoinLocalDate,
  markInviteIntentConsumed,
  type ValidInviteIntent,
} from "./invite-service";
import { profileCompletionSchema } from "./validation";
import { toProfileDTO, uploadProfilePhoto } from "../profiles/service";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type ProfileRow = Tables<"profiles">;

export interface CompletionProfileInput {
  displayName: string;
  timezone: string;
  avatar?: Blob | null;
  avatarPath?: string | null;
}

export interface ProfileMetadata {
  displayName: string | null;
  timezone: string | null;
  avatarPath: string | null;
}

export function getProfileMetadata(user: User): ProfileMetadata {
  const metadata = user.user_metadata;
  const displayName =
    metadata && typeof metadata.display_name === "string"
      ? metadata.display_name
      : metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : metadata && typeof metadata.name === "string"
          ? metadata.name
          : null;
  const timezone =
    metadata && typeof metadata.timezone === "string"
      ? metadata.timezone
      : null;
  const avatarPath =
    metadata && typeof metadata.avatar_path === "string"
      ? metadata.avatar_path
      : null;

  return { displayName, timezone, avatarPath };
}

function isOwnedAvatarPath(path: string, userId: string): boolean {
  return (
    path.startsWith(`avatars/${userId}/`) &&
    !path.includes("..") &&
    !path.includes("\\")
  );
}

export async function getMembershipState(
  userId: string,
  client: AdminClient,
): Promise<"active" | "removed" | "none"> {
  const { data: cohort, error: cohortError } = await client
    .from("cohorts")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (cohortError) {
    throw new Error("Unable to resolve membership");
  }

  if (!cohort) {
    return "none";
  }

  const { data: membership, error } = await client
    .from("memberships")
    .select("removed_at")
    .eq("cohort_id", cohort.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to resolve membership");
  }

  if (!membership) {
    return "none";
  }

  return membership.removed_at ? "removed" : "active";
}

export async function hasConflictingProfileEmail(
  userId: string,
  email: string,
  client: AdminClient,
): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .select("id")
    .eq("email", email)
    .neq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to resolve account identity");
  }

  return Boolean(data);
}

async function getProfileRow(
  userId: string,
  client: AdminClient,
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load profile");
  }

  return data;
}

async function getActiveCohortId(client: AdminClient): Promise<string> {
  const { data, error } = await client
    .from("cohorts")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Unable to resolve active cohort");
  }

  return data.id;
}

async function resolveCompletionIntent(
  userId: string,
  token: string | null | undefined,
  client: AdminClient,
): Promise<ValidInviteIntent> {
  const fromCookie = await findValidInviteIntent(
    token,
    client,
    Date.now(),
    userId,
  );
  const intent =
    fromCookie ?? (await findPendingInviteIntentForUser(userId, client));

  if (!intent) {
    throw new HttpError(
      409,
      "CONFLICT",
      "A valid invite is required to join this group",
    );
  }

  await bindInviteIntentToUser(intent.id, userId, null, client);
  return intent;
}

export async function completeInviteSignup(
  user: User,
  input: CompletionProfileInput,
  inviteToken: string | null | undefined,
  client = createSupabaseAdminClient(),
): Promise<ProfileDTO> {
  const membershipState = await getMembershipState(user.id, client);
  if (membershipState === "removed") {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "This account no longer has group access",
    );
  }

  if (membershipState === "active") {
    const existingProfile = await getProfileRow(user.id, client);
    if (!existingProfile) {
      throw new Error("Active membership has no profile");
    }

    return toProfileDTO(existingProfile, client, "member");
  }

  const parsed = profileCompletionSchema.safeParse({
    displayName: input.displayName,
    timezone: input.timezone,
  });
  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Profile details are invalid",
      {
        fields: parsed.error.issues.reduce<Record<string, string[]>>(
          (details, issue) => {
            const field = issue.path.join(".") || "form";
            details[field] ??= [];
            details[field].push(issue.message);
            return details;
          },
          {},
        ),
      },
    );
  }

  const intent = await resolveCompletionIntent(user.id, inviteToken, client);
  const email = user.email?.trim();
  if (!email) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "A verified email is required",
    );
  }

  let avatarPath = input.avatarPath ?? null;
  if (avatarPath && !isOwnedAvatarPath(avatarPath, user.id)) {
    avatarPath = null;
  }

  let uploadedAvatarPath: string | null = null;
  if (input.avatar) {
    uploadedAvatarPath = await uploadProfilePhoto(
      client,
      user.id,
      input.avatar,
    );
    avatarPath = uploadedAvatarPath;
  }

  let createdProfile = false;
  let previousProfile: ProfileRow | null = null;
  let previousAvatarPath: string | null = null;
  let membershipCreated = false;
  try {
    const existingProfile = await getProfileRow(user.id, client);
    let profile: ProfileRow;

    if (existingProfile) {
      previousProfile = existingProfile;
      previousAvatarPath = existingProfile.avatar_path;
      const update: Database["public"]["Tables"]["profiles"]["Update"] = {
        email,
        display_name: parsed.data.displayName,
        timezone: parsed.data.timezone,
      };
      if (avatarPath) {
        update.avatar_path = avatarPath;
      }

      const { data, error } = await client
        .from("profiles")
        .update(update)
        .eq("id", user.id)
        .select("*")
        .single();

      if (error || !data) {
        throw new Error("Unable to save profile");
      }
      profile = data;
    } else {
      const { data, error } = await client
        .from("profiles")
        .insert({
          id: user.id,
          email,
          display_name: parsed.data.displayName,
          timezone: parsed.data.timezone,
          avatar_path: avatarPath,
        })
        .select("*")
        .single();

      if (error || !data) {
        throw new Error("Unable to create profile");
      }
      profile = data;
      createdProfile = true;
    }

    const cohortId = await getActiveCohortId(client);
    const { error: membershipError } = await client.from("memberships").insert({
      cohort_id: cohortId,
      user_id: user.id,
      role: "member",
      join_local_date: getJoinLocalDate(parsed.data.timezone),
    });

    if (membershipError) {
      throw new Error("Unable to create membership");
    }
    membershipCreated = true;

    await markInviteIntentConsumed(intent.id, user.id, client);
    if (uploadedAvatarPath && previousAvatarPath) {
      await client.storage
        .from("post-photos")
        .remove([previousAvatarPath])
        .catch(() => undefined);
    }
    return toProfileDTO(profile, client, "member");
  } catch (error) {
    if (createdProfile) {
      await client.from("profiles").delete().eq("id", user.id);
    } else if (previousProfile && !membershipCreated) {
      await client
        .from("profiles")
        .update({
          email: previousProfile.email,
          display_name: previousProfile.display_name,
          avatar_path: previousProfile.avatar_path,
          timezone: previousProfile.timezone,
        })
        .eq("id", user.id);
    }
    if (uploadedAvatarPath && (createdProfile || !membershipCreated)) {
      await client.storage
        .from("post-photos")
        .remove([uploadedAvatarPath])
        .catch(() => undefined);
    }
    throw error;
  }
}
