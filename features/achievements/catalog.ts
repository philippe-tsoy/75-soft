import type { AchievementDTO } from "@/lib/types";

import type {
  AchievementCode,
  AchievementDefinition,
} from "@/features/achievements/types";

export const LOCKED_ACHIEVEMENT_TEXT = "???" as const;

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  {
    code: "FIRST_UPDATE",
    title: "First Update",
    description: "Publish your first Post update.",
    isHidden: false,
    priority: 10,
  },
  {
    code: "FIRST_FULL_DAY",
    title: "Full Day",
    description: "Meet all four required goals in one day.",
    isHidden: false,
    priority: 20,
  },
  {
    code: "FIRST_PHOTO",
    title: "First Photo",
    description: "Publish your first photo update.",
    isHidden: false,
    priority: 30,
  },
  {
    code: "DAY_75",
    title: "Day 75",
    description: "Reach Day 75 of the shared calendar.",
    isHidden: false,
    priority: 40,
  },
  {
    code: "THREE_POSTS_ONE_DAY",
    title: "Triple Update",
    description: "Publish three updates on one local date.",
    isHidden: true,
    priority: 50,
  },
  {
    code: "WATER_BEFORE_NOON",
    title: "Early Hydration",
    description: "Reach 2,000 ml before noon in your timezone.",
    isHidden: true,
    priority: 60,
  },
  {
    code: "FULL_DAY_AFTER_MISS",
    title: "Comeback Day",
    description: "Complete a local day immediately after a closed no-goal day.",
    isHidden: true,
    priority: 70,
  },
  {
    code: "WORKOUT_READING_ONE_POST",
    title: "Double Duty",
    description: "Include workout and reading in one Post update.",
    isHidden: true,
    priority: 80,
  },
  {
    code: "SEVEN_PHOTOS",
    title: "Seven Photos",
    description: "Publish seven photo updates.",
    isHidden: true,
    priority: 90,
  },
  {
    code: "WATER_EXACT_TARGET",
    title: "Exact Pour",
    description: "Reach exactly 2,000 ml in a daily water rollup.",
    isHidden: true,
    priority: 100,
  },
] as const;

const catalogByCode = new Map(
  ACHIEVEMENT_CATALOG.map((definition) => [definition.code, definition]),
);

export function getAchievementDefinition(
  code: string,
): AchievementDefinition | undefined {
  return catalogByCode.get(code as AchievementCode);
}

export function toAchievementDTO(
  definition: AchievementDefinition,
  unlockedAt: string | null,
): AchievementDTO {
  const lockedHidden = definition.isHidden && unlockedAt === null;

  return {
    code: definition.code,
    title: lockedHidden ? LOCKED_ACHIEVEMENT_TEXT : definition.title,
    description: lockedHidden
      ? LOCKED_ACHIEVEMENT_TEXT
      : definition.description,
    isHidden: definition.isHidden,
    unlockedAt,
  };
}

export function toCatalogAchievementDTO(
  row: {
    code: string;
    title: string;
    description: string;
    isHidden: boolean;
  },
  unlockedAt: string | null,
): AchievementDTO {
  const lockedHidden = row.isHidden && unlockedAt === null;

  return {
    code: row.code,
    title: lockedHidden ? LOCKED_ACHIEVEMENT_TEXT : row.title,
    description: lockedHidden ? LOCKED_ACHIEVEMENT_TEXT : row.description,
    isHidden: row.isHidden,
    unlockedAt,
  };
}
