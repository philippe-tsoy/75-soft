import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MAX_POST_PHOTO_BYTES,
  POST_PHOTO_MIME_TYPES,
} from "@/lib/config/75-soft";
import type { Database } from "@/lib/supabase/database.types";

export interface ImageValidationResult {
  valid: boolean;
  error?: "unsupported_type" | "too_large" | "empty";
}

export function validateImage(
  file: Pick<Blob, "size" | "type"> | null | undefined,
  allowedTypes: readonly string[] = POST_PHOTO_MIME_TYPES,
  maxBytes = MAX_POST_PHOTO_BYTES,
): ImageValidationResult {
  if (!file || file.size <= 0) {
    return { valid: false, error: "empty" };
  }

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: "unsupported_type" };
  }

  if (file.size > maxBytes) {
    return { valid: false, error: "too_large" };
  }

  return { valid: true };
}

export function getImageExtension(mimeType: string): "jpeg" | "png" | "webp" {
  switch (mimeType) {
    case "image/jpeg":
      return "jpeg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error(`Unsupported image type: ${mimeType}`);
  }
}

export function buildPostPhotoPath(
  authorId: string,
  postId: string,
  randomId: string,
  extension: "jpeg" | "png" | "webp",
): string {
  return `posts/${authorId}/${postId}/${randomId}.${extension}`;
}

export async function createMemberSignedUrl(
  client: SupabaseClient<Database>,
  path: string,
  expiresInSeconds = 60 * 10,
): Promise<string> {
  const { data, error } = await client.storage
    .from("post-photos")
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error("Unable to create a signed media URL");
  }

  return data.signedUrl;
}

export async function deletePostPhoto(
  client: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  const { error } = await client.storage.from("post-photos").remove([path]);
  if (error) {
    throw error;
  }
}
