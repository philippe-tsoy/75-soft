import { describe, expect, it } from "vitest";

import { MAX_POST_PHOTO_BYTES } from "@/lib/config/75-soft";
import { validateImage } from "@/lib/storage";
import { profileUpdateSchema, timezoneSchema } from "@/lib/validation";

import { buildProfilePhotoPath } from "@/features/profiles/photo";

describe("W1 profile validation", () => {
  it("requires a trimmed display name and a valid IANA timezone", () => {
    expect(profileUpdateSchema.parse({ displayName: "  Alex  " })).toEqual({
      displayName: "Alex",
    });
    expect(profileUpdateSchema.safeParse({ displayName: "   " }).success).toBe(
      false,
    );
    expect(timezoneSchema.safeParse("America/New_York").success).toBe(true);
    expect(timezoneSchema.safeParse("Not/AZone").success).toBe(false);
  });

  it("keeps profile photo paths member-scoped and validates image limits", () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    expect(buildProfilePhotoPath(userId, "photo-1", "webp")).toBe(
      `avatars/${userId}/photo-1.webp`,
    );
    expect(
      validateImage({ size: MAX_POST_PHOTO_BYTES, type: "image/png" }),
    ).toEqual({ valid: true });
    expect(
      validateImage({
        size: MAX_POST_PHOTO_BYTES + 1,
        type: "image/png",
      }),
    ).toEqual({ valid: false, error: "too_large" });
    expect(validateImage({ size: 1, type: "image/gif" })).toEqual({
      valid: false,
      error: "unsupported_type",
    });
  });
});
