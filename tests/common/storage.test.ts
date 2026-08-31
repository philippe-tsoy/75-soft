import { describe, expect, it } from "vitest";

import {
  buildPostPhotoPath,
  getImageExtension,
  validateImage,
} from "@/lib/storage";

describe("common storage helpers", () => {
  it("accepts supported images within the 5 MB limit", () => {
    expect(validateImage({ size: 1_000, type: "image/jpeg" })).toEqual({
      valid: true,
    });
    expect(getImageExtension("image/webp")).toBe("webp");
  });

  it("rejects unsupported and oversized media", () => {
    expect(validateImage({ size: 1_000, type: "image/gif" })).toEqual({
      valid: false,
      error: "unsupported_type",
    });
    expect(validateImage({ size: 5_000_001, type: "image/jpeg" })).toEqual({
      valid: false,
      error: "too_large",
    });
  });

  it("keeps media paths scoped to the author and post", () => {
    expect(buildPostPhotoPath("user-1", "post-1", "upload-1", "png")).toBe(
      "posts/user-1/post-1/upload-1.png",
    );
  });
});
