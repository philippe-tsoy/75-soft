import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  adaptOptionalGoalForPost,
  adaptOptionalGoalsForPost,
} from "@/features/optional-goals/post-adapter";
import {
  calculateOptionalGoalDailyStates,
  calculateOptionalGoalStreak,
  optionalGoalStreakToast,
} from "@/features/optional-goals/service";
import type {
  OptionalGoalLogDTO,
  OptionalGoalWithMode,
} from "@/features/optional-goals/types";

const checkboxGoal: OptionalGoalWithMode = {
  id: "00000000-0000-0000-0000-000000000101",
  name: "Meditate",
  targetValue: null,
  unit: null,
  active: true,
  mode: "checkbox",
};

const numericGoal: OptionalGoalWithMode = {
  id: "00000000-0000-0000-0000-000000000102",
  name: "Read",
  targetValue: 10,
  unit: "minutes",
  active: true,
  mode: "numeric",
};

function log(
  id: string,
  localDate: string,
  values: Pick<OptionalGoalLogDTO, "value" | "completed">,
): OptionalGoalLogDTO {
  return {
    id,
    optionalGoalId: numericGoal.id,
    localDate,
    value: values.value,
    completed: values.completed,
    clientOperationId: `00000000-0000-0000-0000-${id.slice(-12)}`,
    createdAt: `${localDate}T12:00:00.000Z`,
  };
}

describe("optional goal domain contracts", () => {
  it("keeps optional-only post entries separate from required goals", () => {
    const checkboxEntry = adaptOptionalGoalForPost(checkboxGoal, {
      optionalGoalId: checkboxGoal.id,
      completed: true,
    });
    const numericEntry = adaptOptionalGoalForPost(numericGoal, {
      optionalGoalId: numericGoal.id,
      value: 10,
    });
    const entries = adaptOptionalGoalsForPost(
      [checkboxGoal, numericGoal],
      [
        { optionalGoalId: checkboxGoal.id, completed: true },
        { optionalGoalId: numericGoal.id, value: 10 },
      ],
    );

    expect(checkboxEntry).toEqual({
      kind: "optional",
      optionalGoalId: checkboxGoal.id,
      completed: true,
    });
    expect(numericEntry).toEqual({
      kind: "optional",
      optionalGoalId: numericGoal.id,
      value: 10,
    });
    expect(entries.every((entry) => entry.kind === "optional")).toBe(true);
    expect(entries.every((entry) => !("key" in entry))).toBe(true);
    expect(() =>
      adaptOptionalGoalForPost(
        { ...checkboxGoal, active: false },
        { optionalGoalId: checkboxGoal.id, completed: true },
      ),
    ).toThrow("Archived optional goals cannot be posted");
  });

  it("sums numeric logs and uses the latest checkbox state", () => {
    const numericLogs = [
      log("00000000-0000-0000-0000-000000000201", "2026-09-01", {
        value: 6,
        completed: null,
      }),
      log("00000000-0000-0000-0000-000000000202", "2026-09-01", {
        value: 4,
        completed: null,
      }),
      log("00000000-0000-0000-0000-000000000203", "2026-08-31", {
        value: 10,
        completed: null,
      }),
    ];
    const checkboxLogs: OptionalGoalLogDTO[] = [
      {
        ...log("00000000-0000-0000-0000-000000000204", "2026-09-01", {
          value: null,
          completed: true,
        }),
        optionalGoalId: checkboxGoal.id,
        clientOperationId: "00000000-0000-0000-0000-000000000304",
      },
      {
        ...log("00000000-0000-0000-0000-000000000205", "2026-09-01", {
          value: null,
          completed: false,
        }),
        optionalGoalId: checkboxGoal.id,
        clientOperationId: "00000000-0000-0000-0000-000000000305",
        createdAt: "2026-09-01T13:00:00.000Z",
      },
    ];

    expect(calculateOptionalGoalDailyStates(numericGoal, numericLogs)).toEqual([
      {
        localDate: "2026-08-31",
        value: 10,
        completed: null,
        met: true,
      },
      {
        localDate: "2026-09-01",
        value: 10,
        completed: null,
        met: true,
      },
    ]);
    expect(
      calculateOptionalGoalDailyStates(checkboxGoal, checkboxLogs),
    ).toEqual([
      {
        localDate: "2026-09-01",
        value: null,
        completed: false,
        met: false,
      },
    ]);
    expect(
      calculateOptionalGoalStreak(numericGoal, numericLogs, "2026-09-01"),
    ).toBe(2);
    expect(optionalGoalStreakToast(numericGoal, 1)).toBeNull();
    expect(optionalGoalStreakToast(numericGoal, 2)).toMatchObject({
      optionalGoalId: numericGoal.id,
      streakDays: 2,
    });
  });
});

describe("optional goal privacy and non-interference contracts", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "database/migrations/0005_optional_goals.sql"),
    "utf8",
  );

  it("keeps both optional tables owner-scoped and denies anonymous access", () => {
    expect(migration).toContain(
      "alter table public.optional_goals enable row level security;",
    );
    expect(migration).toContain(
      "alter table public.optional_goal_logs enable row level security;",
    );
    expect(migration).toContain("owner_id = auth.uid()");
    expect(migration).toContain(
      "revoke all on public.optional_goals from anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke all on public.optional_goal_logs from anon, authenticated;",
    );
    expect(migration).toContain("unique (owner_id, client_operation_id)");
  });

  it("does not grant optional data a required-scoring or board path", () => {
    expect(migration).not.toContain("day_deltas");
    expect(migration).not.toContain("daily_board");
    expect(migration).toContain(
      "Archived optional goals cannot receive new logs",
    );
    expect(migration).toContain(
      "Archived optional goals cannot be reactivated",
    );
  });
});
