export const COHORT_START_DATE = "2026-09-01" as const;

export const DEFAULT_REACTION_PALETTE = ["👍", "🔥", "😂", "❤️", "💪"] as const;

// The product limit is 5 MB; use decimal megabytes at the byte boundary.
export const MAX_POST_PHOTO_BYTES = 5_000_000;
export const MAX_COMMENT_CHARACTERS = 256;
export const MAX_DISPLAY_NAME_CHARACTERS = 80;
export const MAX_WATER_CONTAINER_LABEL_CHARACTERS = 40;
export const MAX_GOAL_NAME_CHARACTERS = 80;
export const MAX_NOTE_CHARACTERS = 2_000;
export const MAX_REACTION_PALETTE_ENTRIES = 20;

export const EDITABLE_DAY_OFFSETS = [0, -1] as const;

export const POST_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
