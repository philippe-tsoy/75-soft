import { describe, expect, it } from "vitest";

import { getMemberLocalDate } from "@/lib/dates";

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
});
