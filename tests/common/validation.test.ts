import { describe, expect, it } from "vitest";

import { DEFAULT_REACTION_PALETTE } from "@/lib/config/75-soft";
import {
  commentBodySchema,
  containerInputSchema,
  goalInputSchema,
  normalizeWaterAmount,
  positiveAmountSchema,
  postGoalInputSchema,
  reactionPaletteSchema,
  waterAmountSchema,
} from "@/lib/validation";

describe("common validation primitives", () => {
  it("rejects zero, negative, non-finite, and over-bound amounts", () => {
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(positiveAmountSchema.safeParse(amount).success).toBe(false);
    }
    expect(positiveAmountSchema.safeParse(1_000_000).success).toBe(true);
    expect(positiveAmountSchema.safeParse(1_000_001).success).toBe(false);
  });

  it("keeps water container volume within a sane positive range", () => {
    expect(
      containerInputSchema.safeParse({ label: "Bottle", volumeMl: 500 })
        .success,
    ).toBe(true);
    expect(
      containerInputSchema.safeParse({ label: "Bottle", volumeMl: 0 }).success,
    ).toBe(false);
  });

  it("normalizes liters to integer milliliters and rejects unsafe results", () => {
    expect(waterAmountSchema.parse({ amount: 0.5, unit: "l" })).toEqual({
      amount: 0.5,
      unit: "l",
    });
    expect(normalizeWaterAmount(0.5, "l")).toBe(500);
    expect(normalizeWaterAmount(1, "l")).toBe(1_000);
    expect(normalizeWaterAmount(1_000, "ml")).toBe(1_000);

    expect(() => normalizeWaterAmount(0.0005, "l")).toThrow();
    expect(() => normalizeWaterAmount(Number.MAX_SAFE_INTEGER, "l")).toThrow();
    expect(
      waterAmountSchema.safeParse({ amount: 1, unit: "gallon" }).success,
    ).toBe(false);
  });

  it("enforces comment length by grapheme rather than UTF-16 code units, and trims", () => {
    expect(commentBodySchema.parse("💪")).toBe("💪");
    expect(commentBodySchema.parse("  Nice work!  ")).toBe("Nice work!");
    expect(() => commentBodySchema.parse("")).toThrow();

    const maxGraphemeComment = "💪".repeat(256);
    expect(commentBodySchema.parse(maxGraphemeComment)).toBe(
      maxGraphemeComment,
    );
    expect(commentBodySchema.safeParse(`${maxGraphemeComment}💪`).success).toBe(
      false,
    );
  });

  it("dedupes reaction palettes and requires single emoji entries", () => {
    expect(
      reactionPaletteSchema.parse({ emoji: [...DEFAULT_REACTION_PALETTE] }),
    ).toEqual({ emoji: [...DEFAULT_REACTION_PALETTE] });
    expect(
      reactionPaletteSchema.safeParse({ emoji: ["👍", "👍"] }).success,
    ).toBe(false);
    expect(
      reactionPaletteSchema.safeParse({ emoji: ["not-an-emoji"] }).success,
    ).toBe(false);
  });

  it("requires a unit whenever a goal has a numeric target", () => {
    expect(
      goalInputSchema.parse({
        name: "Meditate",
        targetValue: 10,
        unit: "minutes",
      }),
    ).toMatchObject({ name: "Meditate", targetValue: 10, unit: "minutes" });
    expect(goalInputSchema.parse({ name: "Stretch" })).toMatchObject({
      name: "Stretch",
    });
    expect(
      goalInputSchema.safeParse({ name: "Meditate", targetValue: 10 }).success,
    ).toBe(false);
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
          value: 10,
          completed: true,
        },
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
