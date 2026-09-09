import { describe, expect, it } from "vitest";

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

  it("keeps profile photo paths scoped to the member", () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    expect(buildProfilePhotoPath(userId, "photo-1", "webp")).toBe(
      `avatars/${userId}/photo-1.webp`,
    );
  });
});
