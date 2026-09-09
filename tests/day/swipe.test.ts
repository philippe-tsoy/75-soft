import { describe, expect, it } from "vitest";

import {
  directionForSign,
  nextSwipeDate,
  resolveSwipeDirection,
} from "@/components/day/swipe";

describe("day pager swipe thresholds", () => {
  it("requires at least 20% of the container width, or 48px, to commit", () => {
    expect(resolveSwipeDirection(-30, 800)).toBeNull();
    expect(resolveSwipeDirection(-160, 800)).toBe("next");
    expect(resolveSwipeDirection(160, 800)).toBe("previous");

    // A narrow container falls back to the 48px floor rather than a tinier
    // fraction of its width.
    expect(resolveSwipeDirection(-40, 100)).toBeNull();
    expect(resolveSwipeDirection(-49, 100)).toBe("next");
  });

  it("treats a drag that never moves as uncommitted", () => {
    expect(resolveSwipeDirection(0, 800)).toBeNull();
  });
});

describe("raw drag direction (no threshold)", () => {
  it("matches the same left/right mapping as the commit threshold", () => {
    expect(directionForSign(-1)).toBe("next");
    expect(directionForSign(1)).toBe("previous");
    expect(directionForSign(0)).toBeNull();
  });
});

describe("day pager date bounds", () => {
  const firstDate = "2026-09-01";
  const today = "2026-09-10";

  it("steps one day at a time within the viewable range", () => {
    expect(nextSwipeDate("2026-09-05", "previous", firstDate, today)).toBe(
      "2026-09-04",
    );
    expect(nextSwipeDate("2026-09-05", "next", firstDate, today)).toBe(
      "2026-09-06",
    );
  });

  it("refuses to cross before the first viewable day", () => {
    expect(nextSwipeDate(firstDate, "previous", firstDate, today)).toBeNull();
  });

  it("refuses to cross past the member's current today", () => {
    expect(nextSwipeDate(today, "next", firstDate, today)).toBeNull();
  });
});
