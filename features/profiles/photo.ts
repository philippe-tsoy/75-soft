export function buildProfilePhotoPath(
  userId: string,
  randomId: string,
  extension: "jpeg" | "png" | "webp",
): string {
  return `avatars/${userId}/${randomId}.${extension}`;
}
