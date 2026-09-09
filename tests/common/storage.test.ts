import { describe, expect, it } from "vitest";

import {
  MAX_POST_PHOTO_BYTES,
  POST_PHOTO_MIME_TYPES,
} from "@/lib/config/75-soft";
import {
  buildPostPhotoPath,
  getImageExtension,
  validateImage,
} from "@/lib/storage";

describe("common storage helpers", () => {
  it("accepts every supported MIME type at and below the exact byte limit", () => {
    for (const type of POST_PHOTO_MIME_TYPES) {
      expect(validateImage({ size: MAX_POST_PHOTO_BYTES, type })).toEqual({
        valid: true,
      });
      expect(validateImage({ size: 1, type })).toEqual({ valid: true });
    }
  });

  it("rejects empty, unsupported, and over-limit payloads", () => {
    expect(validateImage(null)).toEqual({ valid: false, error: "empty" });
    expect(validateImage({ size: 0, type: "image/png" })).toEqual({
      valid: false,
      error: "empty",
    });
    expect(validateImage({ size: 1, type: "image/gif" })).toEqual({
      valid: false,
      error: "unsupported_type",
    });
    expect(
      validateImage({ size: MAX_POST_PHOTO_BYTES + 1, type: "image/jpeg" }),
    ).toEqual({ valid: false, error: "too_large" });
  });

  it("maps every supported MIME type to its matching file extension", () => {
    expect(getImageExtension("image/jpeg")).toBe("jpeg");
    expect(getImageExtension("image/png")).toBe("png");
    expect(getImageExtension("image/webp")).toBe("webp");
    expect(() => getImageExtension("image/gif")).toThrow();
  });

  it("keeps media paths scoped to the author and post", () => {
    expect(buildPostPhotoPath("user-1", "post-1", "upload-1", "png")).toBe(
      "posts/user-1/post-1/upload-1.png",
    );
  });
});
