import "server-only";

import { randomUUID } from "node:crypto";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireActiveMember, type AccessContext } from "@/lib/auth/access";
import { HttpError } from "@/lib/http";
import {
  createMemberSignedUrl,
  deletePostPhoto,
  getImageExtension,
  validateImage,
} from "@/lib/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Tables } from "@/lib/supabase/database.types";
import type { MembershipRole, ProfileDTO } from "@/lib/types";
import { profileUpdateSchema } from "@/lib/validation";

import { buildProfilePhotoPath } from "./photo";

// W1 adapter: the frozen storage contract only defines post-photos. Avatar
// objects use a member-scoped prefix in that private bucket until a dedicated
// profile-photo bucket and policy are added.
export const PROFILE_PHOTO_BUCKET = "post-photos";
export { buildProfilePhotoPath } from "./photo";

type ProfileRow = Tables<"profiles">;
type ProfileClient = SupabaseClient<Database>;

function profileImageError(
  error: "unsupported_type" | "too_large" | "empty",
): HttpError {
  if (error === "unsupported_type") {
    return new HttpError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Profile photo must be a JPEG, PNG, or WebP image",
    );
  }

  if (error === "too_large") {
    return new HttpError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Profile photo is too large",
    );
  }

  return new HttpError(400, "VALIDATION_ERROR", "Profile photo is empty");
}

export function validateProfilePhoto(file: Blob | null | undefined): void {
  const result = validateImage(file);
  if (!result.valid) {
    throw profileImageError(result.error ?? "empty");
  }
}

export async function uploadProfilePhoto(
  client: ProfileClient,
  userId: string,
  file: Blob,
): Promise<string> {
  validateProfilePhoto(file);

  const extension = getImageExtension(file.type);
  const path = buildProfilePhotoPath(userId, randomUUID(), extension);
  const { error } = await client.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error("Unable to store profile photo");
  }

  return path;
}

async function signedAvatarUrl(
  client: ProfileClient,
  avatarPath: string | null,
): Promise<string | null> {
  if (!avatarPath) {
    return null;
  }

  try {
    return await createMemberSignedUrl(client, avatarPath);
  } catch {
    return null;
  }
}

export async function toProfileDTO(
  row: Pick<ProfileRow, "id" | "display_name" | "avatar_path" | "timezone">,
  client: ProfileClient,
  role?: MembershipRole,
): Promise<ProfileDTO> {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: await signedAvatarUrl(client, row.avatar_path),
    timezone: row.timezone,
    ...(role ? { role } : {}),
  };
}

export async function getProfileForUser(
  userId: string,
  role?: MembershipRole,
  client = createSupabaseAdminClient(),
): Promise<ProfileDTO | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name, avatar_path, timezone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load profile");
  }

  return data ? toProfileDTO(data, client, role) : null;
}

export interface ProfileUpdateInput {
  displayName?: string;
  timezone?: string;
}

export async function updateCurrentProfile(
  input: ProfileUpdateInput,
  avatar: Blob | null,
): Promise<ProfileDTO> {
  const access = await requireActiveMember();
  const client = await createSupabaseServerClient();

  const parsed = profileUpdateSchema.safeParse(input);
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

  if (Object.keys(parsed.data).length === 0 && !avatar) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Provide a profile field or a new photo",
    );
  }

  const { data: current, error: currentError } = await client
    .from("profiles")
    .select("id, display_name, avatar_path, timezone")
    .eq("id", access.user.id)
    .maybeSingle();

  if (currentError) {
    throw new Error("Unable to load profile");
  }

  if (!current) {
    throw new HttpError(404, "NOT_FOUND", "Profile was not found");
  }

  let newAvatarPath: string | null = null;
  if (avatar) {
    newAvatarPath = await uploadProfilePhoto(client, access.user.id, avatar);
  }

  const update: Database["public"]["Tables"]["profiles"]["Update"] = {};
  if (parsed.data.displayName !== undefined) {
    update.display_name = parsed.data.displayName;
  }
  if (parsed.data.timezone !== undefined) {
    update.timezone = parsed.data.timezone;
  }
  if (newAvatarPath) {
    update.avatar_path = newAvatarPath;
  }

  const { data: updated, error: updateError } = await client
    .from("profiles")
    .update(update)
    .eq("id", access.user.id)
    .select("id, display_name, avatar_path, timezone")
    .single();

  if (updateError || !updated) {
    if (newAvatarPath) {
      await deletePostPhoto(client, newAvatarPath).catch(() => undefined);
    }
    throw new Error("Unable to update profile");
  }

  if (newAvatarPath && current.avatar_path) {
    await deletePostPhoto(client, current.avatar_path).catch(() => undefined);
  }

  return toProfileDTO(updated, client, access.membership.role);
}

export const getCurrentProfile = cache(async (): Promise<ProfileDTO> => {
  const access: AccessContext = await requireActiveMember();
  const client = await createSupabaseServerClient();
  const profile = await getProfileForUser(
    access.user.id,
    access.membership.role,
    client,
  );

  if (!profile) {
    throw new HttpError(404, "NOT_FOUND", "Profile was not found");
  }

  return profile;
});

export async function getCurrentProfileWithSettings(): Promise<{
  profile: ProfileDTO;
  palette: string[];
}> {
  const access: AccessContext = await requireActiveMember();
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name, avatar_path, timezone, reaction_palette")
    .eq("id", access.user.id)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load profile");
  }

  if (!data) {
    throw new HttpError(404, "NOT_FOUND", "Profile was not found");
  }

  const palette = Array.isArray(data.reaction_palette)
    ? data.reaction_palette.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];

  return {
    profile: await toProfileDTO(data, client, access.membership.role),
    palette,
  };
}
