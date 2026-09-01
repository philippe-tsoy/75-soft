import { describe, expect, it } from "vitest";

import {
  commentBodySchema,
  normalizeWaterAmount,
  postGoalInputSchema,
} from "@/lib/validation";

describe("common validation primitives", () => {
  it("normalizes liters to integer milliliters", () => {
    expect(normalizeWaterAmount(1, "l")).toBe(1_000);
    expect(normalizeWaterAmount(1_000, "ml")).toBe(1_000);
    expect(() => normalizeWaterAmount(0.0005, "l")).toThrow();
  });

  it("enforces comment length by grapheme rather than UTF-16 code units", () => {
    expect(commentBodySchema.parse("💪")).toBe("💪");
    expect(() => commentBodySchema.parse("")).toThrow();
    expect(() => commentBodySchema.parse("a".repeat(257))).toThrow();
  });

  it("accepts an empty selection and distinct optional-goal entries only", () => {
    // Required-goal entries are no longer client-submittable -- the server
    // derives required state from the day's rollup instead. See
    // TEAMS_PERCENTAGE_AND_DAILY_PHOTO.md §4.6.
    expect(postGoalInputSchema.parse([])).toHaveLength(0);

    expect(
      postGoalInputSchema.parse([
        {
          kind: "optional",
          optionalGoalId: "00000000-0000-0000-0000-000000000001",
          completed: true,
        },
      ]),
    ).toHaveLength(1);

    expect(() =>
      postGoalInputSchema.parse([{ kind: "required", key: "workout", amount: 45 }]),
    ).toThrow();
    expect(() =>
      postGoalInputSchema.parse([
        {
          kind: "optional",
          optionalGoalId: "00000000-0000-0000-0000-000000000001",
        },
      ]),
    ).toThrow();
    expect(() =>
      postGoalInputSchema.parse([
        {
          kind: "optional",
          optionalGoalId: "00000000-0000-0000-0000-000000000001",
          completed: true,
        },
        {
          kind: "optional",
          optionalGoalId: "00000000-0000-0000-0000-000000000001",
          completed: false,
        },
      ]),
    ).toThrow();
  });
});
