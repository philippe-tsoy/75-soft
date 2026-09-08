import { describe, expect, it } from "vitest";

import { deriveDayStatus, rankByScore, rankDailyBoard } from "@/lib/scoring";

describe("common scoring primitives", () => {
  it("ranks by percentage of a member's own goals, not raw count", () => {
    expect(
      rankDailyBoard([
        { userId: "a", metCount: 3, totalCount: 3, scoreDate: "2026-09-01" },
        { userId: "b", metCount: 5, totalCount: 7, scoreDate: "2026-09-01" },
        { userId: "c", metCount: 1, totalCount: 4, scoreDate: "2026-09-01" },
      ]),
    ).toEqual([
      {
        userId: "a",
        metCount: 3,
        totalCount: 3,
        scoreDate: "2026-09-01",
        rank: 1,
      },
      {
        userId: "b",
        metCount: 5,
        totalCount: 7,
        scoreDate: "2026-09-01",
        rank: 2,
      },
      {
        userId: "c",
        metCount: 1,
        totalCount: 4,
        scoreDate: "2026-09-01",
        rank: 3,
      },
    ]);
  });

  it("uses competition ranking for equal percentages, and ranks zero-goal members last", () => {
    expect(
      rankDailyBoard([
        { userId: "a", metCount: 3, totalCount: 6, scoreDate: "2026-09-01" },
        { userId: "b", metCount: 1, totalCount: 2, scoreDate: "2026-09-01" },
        { userId: "c", metCount: 0, totalCount: 0, scoreDate: "2026-09-01" },
      ]),
    ).toEqual([
      {
        userId: "a",
        metCount: 3,
        totalCount: 6,
        scoreDate: "2026-09-01",
        rank: 1,
      },
      {
        userId: "b",
        metCount: 1,
        totalCount: 2,
        scoreDate: "2026-09-01",
        rank: 1,
      },
      {
        userId: "c",
        metCount: 0,
        totalCount: 0,
        scoreDate: "2026-09-01",
        rank: 3,
      },
    ]);
  });

  it("ranks a generic score list with the same competition algorithm", () => {
    expect(
      rankByScore([
        { id: "a", score: 80 },
        { id: "b", score: 80 },
        { id: "c", score: 10 },
      ]),
    ).toEqual([
      { id: "a", score: 80, rank: 1 },
      { id: "b", score: 80, rank: 1 },
      { id: "c", score: 10, rank: 3 },
    ]);
  });

  it("keeps day status descriptive rather than aggregate pass/fail", () => {
    expect(
      deriveDayStatus({
        eligible: true,
        isFuture: false,
        isCurrentDay: true,
        metCount: 0,
        totalCount: 3,
      }),
    ).toBe("open");
    expect(
      deriveDayStatus({
        eligible: true,
        isFuture: false,
        isCurrentDay: false,
        metCount: 0,
        totalCount: 3,
      }),
    ).toBe("missed");
    expect(
      deriveDayStatus({
        eligible: true,
        isFuture: false,
        isCurrentDay: true,
        metCount: 2,
        totalCount: 3,
      }),
    ).toBe("in_progress");
    expect(
      deriveDayStatus({
        eligible: true,
        isFuture: false,
        isCurrentDay: true,
        metCount: 3,
        totalCount: 3,
      }),
    ).toBe("complete");
    expect(
      deriveDayStatus({
        eligible: true,
        isFuture: false,
        isCurrentDay: true,
        metCount: 0,
        totalCount: 0,
      }),
    ).toBe("unscored");
    expect(
      deriveDayStatus({
        eligible: false,
        isFuture: false,
        isCurrentDay: true,
        metCount: 0,
        totalCount: 3,
      }),
    ).toBe("unscored");
    expect(
      deriveDayStatus({
        eligible: true,
        isFuture: true,
        isCurrentDay: false,
        metCount: 0,
        totalCount: 3,
      }),
    ).toBe("future");
  });
});
