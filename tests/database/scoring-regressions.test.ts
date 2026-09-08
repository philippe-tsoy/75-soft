import { describe, expect, it } from "vitest";

import {
  formatInstantForViewer,
  getDayNumber,
  getMemberLocalDate,
  getYesterday,
  isEditableDate,
} from "@/lib/dates";

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
});
