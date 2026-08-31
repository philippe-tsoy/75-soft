import { z } from "zod";

import type {
  OptionalGoalWithMode,
  OptionalPostGoalSelection,
} from "@/features/optional-goals/types";
import { getOptionalGoalMode } from "@/features/optional-goals/service";
import { postGoalInputSchema, positiveAmountSchema } from "@/lib/validation";
import type { OptionalGoalDTO } from "@/lib/types";

export const optionalPostGoalSelectionSchema = z.union([
  z.object({
    optionalGoalId: z.string().uuid(),
    value: positiveAmountSchema,
  }),
  z.object({
    optionalGoalId: z.string().uuid(),
    completed: z.boolean(),
  }),
]);

export type OptionalPostGoalInput =
  | {
      kind: "optional";
      optionalGoalId: string;
      value: number;
      completed?: never;
    }
  | {
      kind: "optional";
      optionalGoalId: string;
      value?: never;
      completed: boolean;
    };

function parseOptionalSelection(
  selection: OptionalPostGoalSelection,
): OptionalPostGoalSelection {
  const parsed = optionalPostGoalSelectionSchema.safeParse(selection);
  if (!parsed.success) {
    throw new Error("Invalid optional post goal selection");
  }

  return parsed.data;
}

export function toOptionalPostGoalInput(
  selection: OptionalPostGoalSelection,
): OptionalPostGoalInput {
  const parsed = parseOptionalSelection(selection);
  const candidate = {
    kind: "optional" as const,
    ...parsed,
  };
  const validated = postGoalInputSchema.safeParse([candidate]);

  if (!validated.success || validated.data[0]?.kind !== "optional") {
    throw new Error("Invalid optional post goal selection");
  }

  return candidate;
}

export function adaptOptionalGoalForPost(
  goal: OptionalGoalDTO | OptionalGoalWithMode,
  selection: OptionalPostGoalSelection,
): OptionalPostGoalInput {
  if (!goal.active) {
    throw new Error("Archived optional goals cannot be posted");
  }

  if ("mode" in goal && goal.mode !== getOptionalGoalMode(goal)) {
    throw new Error("Optional goal mode does not match its target");
  }

  if (selection.optionalGoalId !== goal.id) {
    throw new Error("Optional post goal does not belong to the selected goal");
  }

  const parsed = parseOptionalSelection(selection);
  const isNumeric = getOptionalGoalMode(goal) === "numeric";
  const hasValue = "value" in parsed;

  if (isNumeric !== hasValue) {
    throw new Error(
      isNumeric
        ? "Numeric optional goals require a value"
        : "Checkbox optional goals require a completed state",
    );
  }

  return toOptionalPostGoalInput(parsed);
}

export function adaptOptionalGoalsForPost(
  goals: (OptionalGoalDTO | OptionalGoalWithMode)[],
  selections: OptionalPostGoalSelection[],
): OptionalPostGoalInput[] {
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const seen = new Set<string>();

  return selections.map((selection) => {
    if (seen.has(selection.optionalGoalId)) {
      throw new Error("A post cannot select the same optional goal twice");
    }

    seen.add(selection.optionalGoalId);
    const goal = goalsById.get(selection.optionalGoalId);
    if (!goal) {
      throw new Error("Optional post goal was not found");
    }

    return adaptOptionalGoalForPost(goal, selection);
  });
}
