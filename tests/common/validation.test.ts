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

  it("accepts an empty selection and distinct goal entries only", () => {
    expect(postGoalInputSchema.parse([])).toHaveLength(0);

    expect(
      postGoalInputSchema.parse([
        {
          goalId: "00000000-0000-0000-0000-000000000001",
          completed: true,
        },
      ]),
    ).toHaveLength(1);

    expect(() =>
      postGoalInputSchema.parse([
        { goalId: "00000000-0000-0000-0000-000000000001" },
      ]),
    ).toThrow();
    expect(() =>
      postGoalInputSchema.parse([
        {
          goalId: "00000000-0000-0000-0000-000000000001",
          completed: true,
        },
        {
          goalId: "00000000-0000-0000-0000-000000000001",
          completed: false,
        },
      ]),
    ).toThrow();
  });
});
