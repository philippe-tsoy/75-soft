import { describe, expect, it, vi } from "vitest";

import {
  amountDeltaTo,
  applyOptimisticAmount,
  applyOptimisticAmountGoalDone,
  applyOptimisticDiet,
  createDayTrackingMutationService,
  mapDayRollupRow,
  mapDailyBoardScoreRow,
  resolveAmountFill,
  withGoalState,
} from "@/features/day-tracking";
import type {
  DayRollupRow,
  DayTrackingClient,
} from "@/features/day-tracking/database";
import type { DayRollupDTO, GoalProgressDTO } from "@/lib/types";

const emptyDay: DayRollupDTO = {
  localDate: "2026-09-02",
  dayNumber: 2,
  status: "open",
  editable: true,
  invalidated: false,
  goals: {
    workout: { amount: 30, target: 45, unit: "minutes", met: false },
    water: { amount: 1_750, target: 2_000, unit: "ml", met: false },
    reading: { amount: 5, target: 10, unit: "pages", met: false },
    diet: { target: 1, unit: "attestation", met: false },
  },
  metCount: 0,
};

describe("W2 canonical rollup adapters", () => {
  it("maps all four independent flags and preserves descriptive status", () => {
    const row: DayRollupRow = {
      local_date: "2026-09-02",
      day_number: 2,
      status: "in_progress",
      editable: true,
      invalidated: false,
      workout_amount: 45,
      water_amount: 1_999,
      reading_amount: 10,
      diet_met: true,
      met_count: 3,
    };

    expect(mapDayRollupRow(row)).toEqual({
      localDate: "2026-09-02",
      dayNumber: 2,
      status: "in_progress",
      editable: true,
      invalidated: false,
      goals: {
        workout: {
          amount: 45,
          target: 45,
          unit: "minutes",
          met: true,
          markedDone: false,
        },
        water: {
          amount: 1_999,
          target: 2_000,
          unit: "ml",
          met: false,
          markedDone: false,
        },
        reading: {
          amount: 10,
          target: 10,
          unit: "pages",
          met: true,
          markedDone: false,
        },
        diet: { target: 1, unit: "attestation", met: true },
      },
      metCount: 3,
    });
  });

  it("masks every goal and the score for an invalidated day", () => {
    const day = mapDayRollupRow({
      local_date: "2026-09-02",
      day_number: 2,
      status: "missed",
      editable: false,
      invalidated: true,
      workout_amount: 45,
      water_amount: 2_000,
      reading_amount: 10,
      diet_met: true,
      met_count: 4,
    });

    expect(day.metCount).toBe(0);
    expect(Object.values(day.goals).every((goal) => !goal.met)).toBe(true);
    expect(day.goals.workout.amount).toBe(45);
  });

  it("maps the member's current-local-date Board score without prior totals", () => {
    expect(
      mapDailyBoardScoreRow({
        score_date: "2026-09-03",
        goals_achieved_today: 3,
        workout_met: true,
        water_met: true,
        reading_met: false,
        diet_met: true,
        eligible: true,
      }),
    ).toEqual({
      scoreDate: "2026-09-03",
      goalsAchievedToday: 3,
      goalStates: {
        workout: true,
        water: true,
        reading: false,
        diet: true,
      },
      eligible: true,
    });
  });
});

describe("W2 optimistic controls", () => {
  it("updates one amount control and derives an in-progress status", () => {
    const next = applyOptimisticAmount(emptyDay, "workout", 15, "2026-09-02");

    expect(next.goals.workout).toMatchObject({ amount: 45, met: true });
    expect(next.goals.water).toEqual(emptyDay.goals.water);
    expect(next.metCount).toBe(1);
    expect(next.status).toBe("in_progress");
  });

  it("toggles diet independently and rolls back by retaining the prior object", () => {
    const next = applyOptimisticDiet(emptyDay, "2026-09-02");

    expect(next.goals.diet.met).toBe(true);
    expect(next.metCount).toBe(1);
    expect(applyOptimisticDiet(next, "2026-09-02").goals.diet.met).toBe(false);
    expect(emptyDay.goals.diet.met).toBe(false);
  });

  it("does not optimistically change a locked day", () => {
    const locked = { ...emptyDay, editable: false };
    expect(applyOptimisticAmount(locked, "water", 250, "2026-09-02")).toBe(
      locked,
    );
    expect(applyOptimisticDiet(locked, "2026-09-02")).toBe(locked);
  });

  it("applies a negative correction and floors the amount at zero", () => {
    const corrected = applyOptimisticAmount(
      emptyDay,
      "reading",
      -3,
      "2026-09-02",
    );
    expect(corrected.goals.reading.amount).toBe(2);

    const flooredAtZero = applyOptimisticAmount(
      corrected,
      "reading",
      -100,
      "2026-09-02",
    );
    expect(flooredAtZero.goals.reading.amount).toBe(0);
  });

  it("turns an absolute slider value into a signed ledger delta", () => {
    expect(amountDeltaTo(30, 45)).toBe(15);
    expect(amountDeltaTo(30, 10)).toBe(-20);
    // Releasing the thumb where it started must not write a ledger row.
    expect(amountDeltaTo(30, 30)).toBe(0);
    expect(amountDeltaTo(30, Number.NaN)).toBe(0);
  });

  it("meets a goal when the slider is dragged to the target", () => {
    const atTarget = applyOptimisticAmount(
      emptyDay,
      "water",
      amountDeltaTo(emptyDay.goals.water.amount ?? 0, 2_000),
      "2026-09-02",
    );

    expect(atTarget.goals.water).toMatchObject({ amount: 2_000, met: true });
    expect(atTarget.metCount).toBe(1);

    const backToZero = applyOptimisticAmount(
      atTarget,
      "water",
      amountDeltaTo(atTarget.goals.water.amount ?? 0, 0),
      "2026-09-02",
    );

    expect(backToZero.goals.water).toMatchObject({ amount: 0, met: false });
    expect(backToZero.metCount).toBe(0);
  });

  it("resolves the checkmark's fill/undo shortcut for an amount goal", () => {
    // Below target: fills to the target and remembers the prior amount.
    expect(resolveAmountFill(30, 45, undefined)).toEqual({
      action: "fill",
      nextValue: 45,
    });

    // At target with a remembered amount: undoes back to it.
    expect(resolveAmountFill(45, 45, 30)).toEqual({
      action: "revert",
      nextValue: 30,
    });

    // At target with nothing remembered: reached it by dragging the
    // slider itself, so there is no "previous amount" to restore.
    expect(resolveAmountFill(45, 45, undefined)).toEqual({ action: "locked" });

    // Past target (e.g. logged with the steppers) behaves like at-target.
    expect(resolveAmountFill(60, 45, 30)).toEqual({
      action: "revert",
      nextValue: 30,
    });
  });

  it("merges a single goal's confirmed state without clobbering a concurrently in-flight one", () => {
    // Two different goals are both optimistically ahead of the server.
    const bothOptimistic = applyOptimisticAmount(
      applyOptimisticAmount(emptyDay, "workout", 15, "2026-09-02"),
      "water",
      250,
      "2026-09-02",
    );
    expect(bothOptimistic.goals.workout.amount).toBe(45);
    expect(bothOptimistic.goals.water.amount).toBe(2_000);

    // Water's request resolves first; its response only speaks for water.
    const serverWaterState: GoalProgressDTO = {
      amount: 2_000,
      target: 2_000,
      unit: "ml",
      met: true,
    };
    const merged = withGoalState(
      bothOptimistic,
      "water",
      serverWaterState,
      "2026-09-02",
    );

    expect(merged.goals.water).toEqual(serverWaterState);
    // Workout's own still-in-flight optimistic value must survive untouched.
    expect(merged.goals.workout.amount).toBe(45);
    expect(merged.metCount).toBe(2);
  });

  it("toggles a manual done flag independently of the amount", () => {
    const marked = applyOptimisticAmountGoalDone(
      emptyDay,
      "workout",
      "2026-09-02",
    );

    expect(marked.goals.workout).toMatchObject({
      amount: 30,
      markedDone: true,
      met: true,
    });
    expect(marked.metCount).toBe(1);

    const unmarked = applyOptimisticAmountGoalDone(
      marked,
      "workout",
      "2026-09-02",
    );
    expect(unmarked.goals.workout.markedDone).toBe(false);
    expect(unmarked.goals.workout.met).toBe(false);
  });
});

describe("W2 mutation adapter", () => {
  it("uses the container RPC so volume is captured server-side", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ delta_id: "delta-1", idempotent: false }],
      error: null,
    });
    const db = { rpc } as unknown as DayTrackingClient;
    const service = createDayTrackingMutationService(db);

    await expect(
      service.addAmount("user-1", "2026-09-02", {
        goal: "water",
        containerId: "container-1",
        clientOperationId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({ deltaId: "delta-1", idempotent: false });

    expect(rpc).toHaveBeenCalledWith("day_add_container_tap", {
      p_local_date: "2026-09-02",
      p_container_id: "container-1",
      p_client_operation_id: "00000000-0000-0000-0000-000000000001",
    });
  });
});
