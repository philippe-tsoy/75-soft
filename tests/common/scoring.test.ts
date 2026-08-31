import { describe, expect, it } from "vitest";

import {
  calculateDailyBoardScore,
  countMetGoals,
  deriveDayStatus,
  deriveGoalStates,
  rankDailyBoard,
} from "@/lib/scoring";
import {
  allMetGoalStates,
  emptyGoalStates,
  threeMetGoalStates,
} from "@/tests/fixtures/75-soft";

describe("common scoring primitives", () => {
  it("evaluates each required challenge independently", () => {
    expect(
      deriveGoalStates({
        workoutMinutes: 45,
        waterMl: 1_999,
        readingPages: 10,
        dietAttested: true,
      }),
    ).toEqual({
      workout: true,
      water: false,
      reading: true,
      diet: true,
    });
  });

  it("counts only required challenges", () => {
    expect(countMetGoals(threeMetGoalStates)).toBe(3);
    expect(countMetGoals(allMetGoalStates)).toBe(4);
  });

  it("scores the current local date and resets on a new date", () => {
    const yesterday = calculateDailyBoardScore({
      activeMember: true,
      localDate: "2026-09-01",
      joinLocalDate: "2026-09-01",
      goalStates: allMetGoalStates,
    });
    const today = calculateDailyBoardScore({
      activeMember: true,
      localDate: "2026-09-02",
      joinLocalDate: "2026-09-01",
      goalStates: emptyGoalStates,
    });

    expect(yesterday.goalsAchievedToday).toBe(4);
    expect(today.goalsAchievedToday).toBe(0);
    expect(today.scoreDate).toBe("2026-09-02");
  });

  it("does not backfill a late joiner or score an invalidated date", () => {
    const beforeJoin = calculateDailyBoardScore({
      activeMember: true,
      localDate: "2026-09-03",
      joinLocalDate: "2026-09-04",
      goalStates: allMetGoalStates,
    });
    const invalidated = calculateDailyBoardScore({
      activeMember: true,
      localDate: "2026-09-04",
      joinLocalDate: "2026-09-04",
      invalidated: true,
      goalStates: allMetGoalStates,
    });

    expect(beforeJoin.eligible).toBe(false);
    expect(beforeJoin.goalsAchievedToday).toBe(0);
    expect(invalidated.goalStates).toEqual(emptyGoalStates);
    expect(invalidated.goalsAchievedToday).toBe(0);
  });

  it("uses competition ranking for equal daily counts", () => {
    expect(
      rankDailyBoard([
        { userId: "a", goalsAchievedToday: 3, scoreDate: "2026-09-01" },
        { userId: "b", goalsAchievedToday: 3, scoreDate: "2026-09-01" },
        { userId: "c", goalsAchievedToday: 1, scoreDate: "2026-09-01" },
      ]),
    ).toEqual([
      { userId: "a", goalsAchievedToday: 3, scoreDate: "2026-09-01", rank: 1 },
      { userId: "b", goalsAchievedToday: 3, scoreDate: "2026-09-01", rank: 1 },
      { userId: "c", goalsAchievedToday: 1, scoreDate: "2026-09-01", rank: 3 },
    ]);
  });

  it("keeps day status descriptive rather than aggregate pass/fail", () => {
    expect(
      deriveDayStatus({
        eligible: true,
        isFuture: false,
        isCurrentDay: true,
        metCount: 0,
      }),
    ).toBe("open");
    expect(
      deriveDayStatus({
        eligible: true,
        isFuture: false,
        isCurrentDay: false,
        metCount: 0,
      }),
    ).toBe("missed");
    expect(
      deriveDayStatus({
        eligible: true,
        isFuture: false,
        isCurrentDay: true,
        metCount: 3,
      }),
    ).toBe("in_progress");
  });
});
