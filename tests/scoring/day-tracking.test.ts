import { describe, expect, it, vi } from "vitest";

import {
  amountDeltaTo,
  applyOptimisticAmount,
  applyOptimisticGoalDone,
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

const WORKOUT_ID = "00000000-0000-0000-0000-000000000030";
const WATER_ID = "00000000-0000-0000-0000-000000000031";
const READING_ID = "00000000-0000-0000-0000-000000000032";
const DIET_ID = "00000000-0000-0000-0000-000000000033";

function goal(overrides: Partial<GoalProgressDTO>): GoalProgressDTO {
  return {
    id: WORKOUT_ID,
    name: "Workout",
    isPrivate: false,
    met: false,
    ...overrides,
  };
}

const emptyDay: DayRollupDTO = {
  localDate: "2026-09-02",
  dayNumber: 2,
  status: "open",
  editable: true,
  invalidated: false,
  goals: [
    goal({
      id: WORKOUT_ID,
      name: "Workout",
      amount: 30,
      target: 45,
      unit: "minutes",
      met: false,
    }),
    goal({
      id: WATER_ID,
      name: "Water",
      amount: 1_750,
      target: 2_000,
      unit: "ml",
      met: false,
    }),
    goal({
      id: READING_ID,
      name: "Reading",
      amount: 5,
      target: 10,
      unit: "pages",
      met: false,
    }),
    goal({
      id: DIET_ID,
      name: "Diet",
      unit: null,
      met: false,
      markedDone: false,
    }),
  ],
  metCount: 0,
  totalCount: 4,
};

function findGoal(day: DayRollupDTO, id: string): GoalProgressDTO {
  const found = day.goals.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Goal ${id} not found`);
  }
  return found;
}

describe("W2 canonical rollup adapters", () => {
  it("maps every goal independently and preserves descriptive status", () => {
    const row: DayRollupRow = {
      local_date: "2026-09-02",
      day_number: 2,
      status: "in_progress",
      editable: true,
      invalidated: false,
      met_count: 3,
      total_count: 4,
      goals: [
        {
          id: WORKOUT_ID,
          name: "Workout",
          isPrivate: false,
          amount: 45,
          target: 45,
          unit: "minutes",
          met: true,
          markedDone: false,
        },
        {
          id: WATER_ID,
          name: "Water",
          isPrivate: false,
          amount: 1_999,
          target: 2_000,
          unit: "ml",
          met: false,
          markedDone: false,
        },
        {
          id: READING_ID,
          name: "Reading",
          isPrivate: false,
          amount: 10,
          target: 10,
          unit: "pages",
          met: true,
          markedDone: false,
        },
        {
          id: DIET_ID,
          name: "Diet",
          isPrivate: false,
          amount: null,
          target: null,
          unit: null,
          met: true,
          markedDone: true,
        },
      ],
    };

    expect(mapDayRollupRow(row)).toEqual({
      localDate: "2026-09-02",
      dayNumber: 2,
      status: "in_progress",
      editable: true,
      invalidated: false,
      goals: [
        {
          id: WORKOUT_ID,
          name: "Workout",
          isPrivate: false,
          amount: 45,
          target: 45,
          unit: "minutes",
          met: true,
          markedDone: false,
        },
        {
          id: WATER_ID,
          name: "Water",
          isPrivate: false,
          amount: 1_999,
          target: 2_000,
          unit: "ml",
          met: false,
          markedDone: false,
        },
        {
          id: READING_ID,
          name: "Reading",
          isPrivate: false,
          amount: 10,
          target: 10,
          unit: "pages",
          met: true,
          markedDone: false,
        },
        {
          id: DIET_ID,
          name: "Diet",
          isPrivate: false,
          unit: null,
          met: true,
          markedDone: true,
        },
      ],
      metCount: 3,
      totalCount: 4,
    });
  });

  it("masks every goal and the score for an invalidated day", () => {
    const day = mapDayRollupRow({
      local_date: "2026-09-02",
      day_number: 2,
      status: "missed",
      editable: false,
      invalidated: true,
      met_count: 4,
      total_count: 4,
      goals: [
        {
          id: WORKOUT_ID,
          name: "Workout",
          isPrivate: false,
          amount: 45,
          target: 45,
          unit: "minutes",
          met: true,
          markedDone: false,
        },
      ],
    });

    expect(day.metCount).toBe(0);
    expect(day.totalCount).toBe(0);
    expect(day.goals).toEqual([]);
  });

  it("maps the member's current-local-date Board score without prior totals", () => {
    expect(
      mapDailyBoardScoreRow({
        score_date: "2026-09-03",
        met_count: 3,
        total_count: 4,
        eligible: true,
      }),
    ).toEqual({
      scoreDate: "2026-09-03",
      metCount: 3,
      totalCount: 4,
      eligible: true,
    });
  });
});

describe("W2 optimistic controls", () => {
  it("updates one amount control and derives an in-progress status", () => {
    const next = applyOptimisticAmount(emptyDay, WORKOUT_ID, 15, "2026-09-02");

    expect(findGoal(next, WORKOUT_ID)).toMatchObject({
      amount: 45,
      met: true,
    });
    expect(findGoal(next, WATER_ID)).toEqual(findGoal(emptyDay, WATER_ID));
    expect(next.metCount).toBe(1);
    expect(next.status).toBe("in_progress");
  });

  it("toggles a checkbox goal independently and rolls back by retaining the prior object", () => {
    const next = applyOptimisticGoalDone(emptyDay, DIET_ID, "2026-09-02");

    expect(findGoal(next, DIET_ID).met).toBe(true);
    expect(next.metCount).toBe(1);
    expect(
      findGoal(
        applyOptimisticGoalDone(next, DIET_ID, "2026-09-02"),
        DIET_ID,
      ).met,
    ).toBe(false);
    expect(findGoal(emptyDay, DIET_ID).met).toBe(false);
  });

  it("does not optimistically change a locked day", () => {
    const locked = { ...emptyDay, editable: false };
    expect(applyOptimisticAmount(locked, WATER_ID, 250, "2026-09-02")).toBe(
      locked,
    );
    expect(applyOptimisticGoalDone(locked, DIET_ID, "2026-09-02")).toBe(
      locked,
    );
  });

  it("applies a negative correction and floors the amount at zero", () => {
    const corrected = applyOptimisticAmount(
      emptyDay,
      READING_ID,
      -3,
      "2026-09-02",
    );
    expect(findGoal(corrected, READING_ID).amount).toBe(2);

    const flooredAtZero = applyOptimisticAmount(
      corrected,
      READING_ID,
      -100,
      "2026-09-02",
    );
    expect(findGoal(flooredAtZero, READING_ID).amount).toBe(0);
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
      WATER_ID,
      amountDeltaTo(findGoal(emptyDay, WATER_ID).amount ?? 0, 2_000),
      "2026-09-02",
    );

    expect(findGoal(atTarget, WATER_ID)).toMatchObject({
      amount: 2_000,
      met: true,
    });
    expect(atTarget.metCount).toBe(1);

    const backToZero = applyOptimisticAmount(
      atTarget,
      WATER_ID,
      amountDeltaTo(findGoal(atTarget, WATER_ID).amount ?? 0, 0),
      "2026-09-02",
    );

    expect(findGoal(backToZero, WATER_ID)).toMatchObject({
      amount: 0,
      met: false,
    });
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
      applyOptimisticAmount(emptyDay, WORKOUT_ID, 15, "2026-09-02"),
      WATER_ID,
      250,
      "2026-09-02",
    );
    expect(findGoal(bothOptimistic, WORKOUT_ID).amount).toBe(45);
    expect(findGoal(bothOptimistic, WATER_ID).amount).toBe(2_000);

    // Water's request resolves first; its response only speaks for water.
    const serverWaterState: GoalProgressDTO = goal({
      id: WATER_ID,
      name: "Water",
      amount: 2_000,
      target: 2_000,
      unit: "ml",
      met: true,
    });
    const merged = withGoalState(
      bothOptimistic,
      WATER_ID,
      serverWaterState,
      "2026-09-02",
    );

    expect(findGoal(merged, WATER_ID)).toEqual(serverWaterState);
    // Workout's own still-in-flight optimistic value must survive untouched.
    expect(findGoal(merged, WORKOUT_ID).amount).toBe(45);
    expect(merged.metCount).toBe(2);
  });

  it("toggles a manual done flag independently of the amount", () => {
    const marked = applyOptimisticGoalDone(emptyDay, WORKOUT_ID, "2026-09-02");

    expect(findGoal(marked, WORKOUT_ID)).toMatchObject({
      amount: 30,
      markedDone: true,
      met: true,
    });
    expect(marked.metCount).toBe(1);

    const unmarked = applyOptimisticGoalDone(
      marked,
      WORKOUT_ID,
      "2026-09-02",
    );
    expect(findGoal(unmarked, WORKOUT_ID).markedDone).toBe(false);
    expect(findGoal(unmarked, WORKOUT_ID).met).toBe(false);
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
        goalId: WATER_ID,
        containerId: "container-1",
        clientOperationId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({ deltaId: "delta-1", idempotent: false });

    expect(rpc).toHaveBeenCalledWith("day_add_container_tap", {
      p_local_date: "2026-09-02",
      p_container_id: "container-1",
      p_goal_id: WATER_ID,
      p_client_operation_id: "00000000-0000-0000-0000-000000000001",
    });
  });
});
