import { describe, expect, it } from "vitest";

import {
  formatInstantForViewer,
  getDayNumber,
  getMemberLocalDate,
  getYesterday,
  isEditableDate,
} from "@/lib/dates";
import {
  calculateDailyBoardScore,
  deriveDayStatus,
  deriveGoalStates,
  rankDailyBoard,
} from "@/lib/scoring";
import {
  allMetGoalStates,
  emptyGoalStates,
  goldenScoringFixtures,
} from "@/tests/fixtures/75-soft";

describe("W8 scoring and timezone regressions", () => {
  it("changes dates at each member's local midnight", () => {
    const cases = [
      {
        timezone: "America/New_York",
        before: "2026-09-02T03:59:59.999Z",
        after: "2026-09-02T04:00:00.000Z",
      },
      {
        timezone: "America/Los_Angeles",
        before: "2026-09-02T06:59:59.999Z",
        after: "2026-09-02T07:00:00.000Z",
      },
      {
        timezone: "Europe/London",
        before: "2026-09-01T22:59:59.999Z",
        after: "2026-09-01T23:00:00.000Z",
      },
      {
        timezone: "Asia/Tokyo",
        before: "2026-09-01T14:59:59.999Z",
        after: "2026-09-01T15:00:00.000Z",
      },
    ] as const;

    for (const { timezone, before, after } of cases) {
      expect(getMemberLocalDate(before, timezone)).toBe("2026-09-01");
      expect(getMemberLocalDate(after, timezone)).toBe("2026-09-02");
    }
  });

  it("does not shift a user's local date across DST transitions", () => {
    const cases = [
      {
        timezone: "America/New_York",
        before: "2026-03-08T06:59:59.000Z",
        after: "2026-03-08T07:00:00.000Z",
        expected: "2026-03-08",
      },
      {
        timezone: "America/Los_Angeles",
        before: "2026-03-08T09:59:59.000Z",
        after: "2026-03-08T10:00:00.000Z",
        expected: "2026-03-08",
      },
      {
        timezone: "Europe/London",
        before: "2026-03-29T00:59:59.000Z",
        after: "2026-03-29T01:00:00.000Z",
        expected: "2026-03-29",
      },
    ] as const;

    for (const { timezone, before, after, expected } of cases) {
      expect(getMemberLocalDate(before, timezone)).toBe(expected);
      expect(getMemberLocalDate(after, timezone)).toBe(expected);
    }
  });

  it("keeps historical local dates stable when a timezone changes", () => {
    const joinLocalDate = "2026-09-04";

    expect(isEditableDate("2026-09-04", "2026-09-05", joinLocalDate)).toBe(
      true,
    );
    expect(isEditableDate("2026-09-04", "2026-09-06", joinLocalDate)).toBe(
      false,
    );
    expect(getYesterday("2026-09-05")).toBe("2026-09-04");
    expect(getDayNumber(joinLocalDate, "2026-09-01")).toBe(4);
  });

  it("converts viewer-local feed instants without changing stored instants", () => {
    const instant = "2026-09-02T03:59:59.000Z";

    expect(
      formatInstantForViewer(instant, "America/New_York", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    ).toContain("9/1/26");
    expect(
      formatInstantForViewer(instant, "Asia/Tokyo", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    ).toContain("9/2/26");
  });

  it("applies canonical units and thresholds without double counting", () => {
    const states = deriveGoalStates({
      workoutMinutes: 15 + 30,
      waterMl: 1_000 + 1_000,
      readingPages: 10,
      dietAttested: true,
    });

    expect(states).toEqual(allMetGoalStates);
    expect(
      calculateDailyBoardScore({
        activeMember: true,
        localDate: goldenScoringFixtures.firstCohortDay.localDate,
        joinLocalDate: "2026-09-01",
        goalStates: states,
      }).goalsAchievedToday,
    ).toBe(4);
  });

  it("resets the Board at local midnight and excludes late joiners", () => {
    const previousDate = calculateDailyBoardScore({
      activeMember: true,
      localDate: goldenScoringFixtures.localMidnight.previousDate,
      joinLocalDate: "2026-09-01",
      goalStates: allMetGoalStates,
    });
    const nextDate = calculateDailyBoardScore({
      activeMember: true,
      localDate: goldenScoringFixtures.localMidnight.nextDate,
      joinLocalDate: "2026-09-01",
      goalStates: emptyGoalStates,
    });
    const preJoin = calculateDailyBoardScore({
      activeMember: true,
      localDate: goldenScoringFixtures.lateJoiner.preJoinDate,
      joinLocalDate: goldenScoringFixtures.lateJoiner.joinLocalDate,
      goalStates: allMetGoalStates,
    });

    expect(previousDate.goalsAchievedToday).toBe(4);
    expect(nextDate.goalsAchievedToday).toBe(0);
    expect(nextDate.scoreDate).toBe("2026-09-02");
    expect(preJoin.eligible).toBe(false);
    expect(preJoin.goalsAchievedToday).toBe(0);
  });

  it("masks every challenge on invalidation while preserving display semantics", () => {
    const invalidated = calculateDailyBoardScore({
      activeMember: true,
      localDate: "2026-09-01",
      joinLocalDate: "2026-09-01",
      invalidated: true,
      goalStates: allMetGoalStates,
    });

    expect(invalidated.goalStates).toEqual(emptyGoalStates);
    expect(invalidated.goalsAchievedToday).toBe(0);
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
  });

  it("uses competition ranking without a hidden tie-breaker", () => {
    expect(
      rankDailyBoard([
        { userId: "member-a", goalsAchievedToday: 3, scoreDate: "2026-09-01" },
        { userId: "member-b", goalsAchievedToday: 3, scoreDate: "2026-09-02" },
        { userId: "member-c", goalsAchievedToday: 1, scoreDate: "2026-09-01" },
      ]),
    ).toEqual([
      {
        userId: "member-a",
        goalsAchievedToday: 3,
        scoreDate: "2026-09-01",
        rank: 1,
      },
      {
        userId: "member-b",
        goalsAchievedToday: 3,
        scoreDate: "2026-09-02",
        rank: 1,
      },
      {
        userId: "member-c",
        goalsAchievedToday: 1,
        scoreDate: "2026-09-01",
        rank: 3,
      },
    ]);
  });
});
