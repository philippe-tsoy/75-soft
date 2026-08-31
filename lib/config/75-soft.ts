export const COHORT_START_DATE = "2026-09-01" as const;

export const REQUIRED_GOALS = {
  workout: {
    key: "workout",
    label: "Workout",
    target: 45,
    unit: "minutes",
  },
  water: {
    key: "water",
    label: "Water",
    target: 2000,
    unit: "ml",
  },
  reading: {
    key: "reading",
    label: "Reading",
    target: 10,
    unit: "pages",
  },
  diet: {
    key: "diet",
    label: "Ate well & drank only socially",
    target: 1,
    unit: "attestation",
  },
} as const;

export const REQUIRED_GOAL_KEYS = [
  "workout",
  "water",
  "reading",
  "diet",
] as const;

export const WORKOUT_TARGET_MINUTES = 45;
export const WATER_TARGET_ML = 2_000;
export const READING_TARGET_PAGES = 10;

export const DEFAULT_REACTION_PALETTE = ["👍", "🔥", "😂", "❤️", "💪"] as const;

// The product limit is 5 MB; use decimal megabytes at the byte boundary.
export const MAX_POST_PHOTO_BYTES = 5_000_000;
export const MAX_COMMENT_CHARACTERS = 256;
export const MAX_DISPLAY_NAME_CHARACTERS = 80;
export const MAX_WATER_CONTAINER_LABEL_CHARACTERS = 40;
export const MAX_OPTIONAL_GOAL_NAME_CHARACTERS = 80;
export const MAX_NOTE_CHARACTERS = 2_000;
export const MAX_REACTION_PALETTE_ENTRIES = 20;

export const EDITABLE_DAY_OFFSETS = [0, -1] as const;

export const POST_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const isRequiredGoalKey = (
  value: string,
): value is (typeof REQUIRED_GOAL_KEYS)[number] =>
  (REQUIRED_GOAL_KEYS as readonly string[]).includes(value);
