import { describe, expect, it } from "vitest";

import {
  formatInstantForViewer,
  getDayNumber,
  getMemberLocalDate,
  getYesterday,
  isEditableDate,
  isValidISODate,
} from "@/lib/dates";

describe("common date utilities", () => {
  it("derives a member date from an instant and IANA timezone", () => {
    expect(
      getMemberLocalDate("2026-09-02T03:59:59.000Z", "America/New_York"),
    ).toBe("2026-09-01");
    expect(
      getMemberLocalDate("2026-09-02T04:00:00.000Z", "America/New_York"),
    ).toBe("2026-09-02");
    expect(getMemberLocalDate("2026-09-01T15:00:00.000Z", "Asia/Tokyo")).toBe(
      "2026-09-02",
    );
  });

  it("handles date-only arithmetic without timezone drift", () => {
    expect(getYesterday("2026-09-01")).toBe("2026-08-31");
    expect(getDayNumber("2026-09-01", "2026-09-01")).toBe(1);
    expect(getDayNumber("2026-09-04", "2026-09-01")).toBe(4);
  });

  it("keeps the edit window local and excludes invalidated dates", () => {
    expect(isEditableDate("2026-09-02", "2026-09-02", "2026-09-01")).toBe(true);
    expect(isEditableDate("2026-09-01", "2026-09-02", "2026-09-01")).toBe(true);
    expect(isEditableDate("2026-08-31", "2026-09-02", "2026-09-01")).toBe(
      false,
    );
    expect(isEditableDate("2026-09-01", "2026-09-02", "2026-09-01", true)).toBe(
      false,
    );
  });

  it("validates ISO calendar dates and formats instants for viewers", () => {
    expect(isValidISODate("2026-02-28")).toBe(true);
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(
      formatInstantForViewer("2026-09-02T03:59:00.000Z", "America/New_York", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    ).toContain("9/1/26");
  });
});
