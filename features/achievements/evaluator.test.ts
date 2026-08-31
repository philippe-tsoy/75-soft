import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_CATALOG,
  LOCKED_ACHIEVEMENT_TEXT,
  toAchievementDTO,
} from "@/features/achievements/catalog";
import { evaluateAchievementRules } from "@/features/achievements/evaluator";
import type {
  AchievementDayEvidence,
  AchievementEvidence,
  AchievementPostEvidence,
} from "@/features/achievements/types";

const emptyEvidence: AchievementEvidence = {
  activeMember: true,
  currentLocalDate: "2026-09-10",
  currentDayNumber: 10,
  posts: [],
  waterEvents: [],
  days: [],
};

function post(
  id: string,
  overrides: Partial<AchievementPostEvidence> = {},
): AchievementPostEvidence {
  return {
    id,
    localDate: "2026-09-10",
    createdAt: `2026-09-10T10:00:0${id}Z`,
    hasPhoto: false,
    requiredGoals: [],
    ...overrides,
  };
}

function day(
  localDate: string,
  overrides: Partial<AchievementDayEvidence> = {},
): AchievementDayEvidence {
  return {
    localDate,
    dayNumber: 1,
    status: "missed",
    metCount: 0,
    invalidated: false,
    ...overrides,
  };
}

describe("achievement catalog and evaluator", () => {
  it("seeds the fixed and exact initial hidden catalog", () => {
    expect(ACHIEVEMENT_CATALOG.map((achievement) => achievement.code)).toEqual([
      "FIRST_UPDATE",
      "FIRST_FULL_DAY",
      "FIRST_PHOTO",
      "DAY_75",
      "THREE_POSTS_ONE_DAY",
      "WATER_BEFORE_NOON",
      "FULL_DAY_AFTER_MISS",
      "WORKOUT_READING_ONE_POST",
      "SEVEN_PHOTOS",
      "WATER_EXACT_TARGET",
    ]);
  });

  it("renders hidden locked achievements as ???", () => {
    const hidden = ACHIEVEMENT_CATALOG.find(
      (achievement) => achievement.code === "WATER_EXACT_TARGET",
    );

    expect(hidden).toBeDefined();
    expect(toAchievementDTO(hidden!, null)).toMatchObject({
      title: LOCKED_ACHIEVEMENT_TEXT,
      description: LOCKED_ACHIEVEMENT_TEXT,
      isHidden: true,
      unlockedAt: null,
    });
    expect(toAchievementDTO(hidden!, "2026-09-10T10:00:00.000Z")).toMatchObject(
      {
        title: "Exact Pour",
        description: "Reach exactly 2,000 ml in a daily water rollup.",
      },
    );
  });

  it("returns every simultaneous unlock in deterministic priority order", () => {
    const evidence: AchievementEvidence = {
      ...emptyEvidence,
      currentDayNumber: 75,
      posts: [
        post("1", { hasPhoto: true, requiredGoals: ["workout", "reading"] }),
      ],
      days: [day("2026-09-10", { status: "complete", metCount: 4 })],
    };

    const result = evaluateAchievementRules(evidence);

    expect(result.newlyUnlocked.map((achievement) => achievement.code)).toEqual(
      [
        "FIRST_UPDATE",
        "FIRST_FULL_DAY",
        "FIRST_PHOTO",
        "DAY_75",
        "WORKOUT_READING_ONE_POST",
      ],
    );
    expect(result.toast?.code).toBe("FIRST_UPDATE");
  });

  it("is monotonic and returns no second toast for an existing unlock", () => {
    const evidence: AchievementEvidence = {
      ...emptyEvidence,
      posts: [post("1")],
    };

    const result = evaluateAchievementRules(
      evidence,
      new Set(["FIRST_UPDATE"]),
    );

    expect(result.newlyUnlocked).toEqual([]);
    expect(result.toast).toBeNull();
  });

  it("does not unlock achievements from invalidated evidence", () => {
    const evidence: AchievementEvidence = {
      ...emptyEvidence,
      posts: [
        post("1", { hasPhoto: true, invalidated: true }),
        post("2", { hasPhoto: true, invalidated: true }),
        post("3", { hasPhoto: true, invalidated: true }),
      ],
      waterEvents: [
        {
          id: "water-1",
          localDate: "2026-09-10",
          createdAt: "2026-09-10T10:00:00.000Z",
          amountMl: 2_000,
          localHour: 10,
          invalidated: true,
        },
      ],
      days: [day("2026-09-10", { invalidated: true })],
    };

    expect(evaluateAchievementRules(evidence).newlyUnlocked).toEqual([]);
  });

  it("evaluates Day 75 lazily when the member loads on or after that day", () => {
    expect(
      evaluateAchievementRules({
        ...emptyEvidence,
        currentDayNumber: 74,
      }).newlyUnlocked,
    ).toEqual([]);

    expect(
      evaluateAchievementRules({
        ...emptyEvidence,
        currentDayNumber: 75,
      }).newlyUnlocked.map((achievement) => achievement.code),
    ).toContain("DAY_75");
  });

  it("recognizes the hidden event-based rules", () => {
    const evidence: AchievementEvidence = {
      ...emptyEvidence,
      posts: [
        post("1", { hasPhoto: true }),
        post("2", { hasPhoto: true }),
        post("3", { hasPhoto: true }),
        post("4", { hasPhoto: true }),
        post("5", { hasPhoto: true }),
        post("6", { hasPhoto: true }),
        post("7", { hasPhoto: true }),
      ],
      waterEvents: [
        {
          id: "water-1",
          localDate: "2026-09-10",
          createdAt: "2026-09-10T10:00:00.000Z",
          amountMl: 1_000,
          localHour: 10,
        },
        {
          id: "water-2",
          localDate: "2026-09-10",
          createdAt: "2026-09-10T11:00:00.000Z",
          amountMl: 1_000,
          localHour: 11,
        },
      ],
      days: [
        day("2026-09-09"),
        day("2026-09-10", { status: "complete", metCount: 4 }),
      ],
    };

    const codes = evaluateAchievementRules(evidence).newlyUnlocked.map(
      (achievement) => achievement.code,
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        "THREE_POSTS_ONE_DAY",
        "WATER_BEFORE_NOON",
        "FULL_DAY_AFTER_MISS",
        "SEVEN_PHOTOS",
        "WATER_EXACT_TARGET",
      ]),
    );
  });
});
