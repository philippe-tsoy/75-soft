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

  it("requires one distinct selected goal shape per post entry", () => {
    expect(
      postGoalInputSchema.parse([
        { kind: "required", key: "workout", amount: 45 },
        {
          kind: "optional",
          optionalGoalId: "00000000-0000-0000-0000-000000000001",
          completed: true,
        },
      ]),
    ).toHaveLength(2);

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
        { kind: "required", key: "workout", amount: 45 },
        { kind: "required", key: "workout", amount: 30 },
      ]),
    ).toThrow();
  });
});
