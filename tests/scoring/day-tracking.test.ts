import { describe, expect, it, vi } from "vitest";

import {
  applyOptimisticAmount,
  applyOptimisticDiet,
  createDayTrackingMutationService,
  mapDayRollupRow,
  mapDailyBoardScoreRow,
} from "@/features/day-tracking";
import type {
  DayRollupRow,
  DayTrackingClient,
} from "@/features/day-tracking/database";
import type { DayRollupDTO } from "@/lib/types";

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
        workout: { amount: 45, target: 45, unit: "minutes", met: true },
        water: { amount: 1_999, target: 2_000, unit: "ml", met: false },
        reading: { amount: 10, target: 10, unit: "pages", met: true },
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
