"use client";

import { useState, type FormEvent } from "react";

import { Button, Input, Label } from "@/components/ui";
import { Sheet } from "@/components/sheets/sheet";
import {
  createOptionalGoal,
  OptionalGoalApiError,
  updateOptionalGoal,
} from "@/components/optional-goals/api";
import type { OptionalGoalCreateInput } from "@/features/optional-goals/types";
import type { OptionalGoalDTO } from "@/lib/types";
import { MAX_OPTIONAL_GOAL_NAME_CHARACTERS } from "@/lib/config/75-soft";
import { MutationStatus } from "@/components/feedback";
import { optionalGoalInputSchema } from "@/lib/validation";

interface OptionalGoalFormProps {
  open: boolean;
  goal: OptionalGoalDTO | null;
  onClose: () => void;
  onSaved: (goal: OptionalGoalDTO) => void | Promise<void>;
}

type FormMode = "checkbox" | "numeric";

export function OptionalGoalForm({
  open,
  goal,
  onClose,
  onSaved,
}: OptionalGoalFormProps) {
  const [name, setName] = useState(goal?.name ?? "");
  const [mode, setMode] = useState<FormMode>(
    goal?.targetValue === null ? "checkbox" : "numeric",
  );
  const [targetValue, setTargetValue] = useState(
    goal?.targetValue === null || goal?.targetValue === undefined
      ? ""
      : String(goal.targetValue),
  );
  const [unit, setUnit] = useState(goal?.unit ?? "");
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const numericTarget = mode === "numeric" ? Number(targetValue) : null;
    const candidate = {
      name,
      targetValue: numericTarget,
      unit: mode === "numeric" ? unit : null,
    };
    const parsed = optionalGoalInputSchema.safeParse(candidate);

    if (!parsed.success) {
      setStatus("error");
      setErrorMessage(parsed.error.issues[0]?.message ?? "Check the goal");
      return;
    }

    if (
      parsed.data.targetValue !== null &&
      parsed.data.targetValue !== undefined &&
      parsed.data.targetValue > 1_000_000
    ) {
      setStatus("error");
      setErrorMessage("Target must be 1,000,000 or less");
      return;
    }

    const input: OptionalGoalCreateInput = {
      name: parsed.data.name,
      targetValue: parsed.data.targetValue ?? null,
      unit: parsed.data.unit ?? null,
    };

    setStatus("pending");

    try {
      const saved = goal
        ? await updateOptionalGoal(goal.id, input)
        : await createOptionalGoal(input);
      await onSaved(saved);
      setStatus("success");
      onClose();
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof OptionalGoalApiError
          ? error.message
          : "Could not save this optional goal. Try again.",
      );
    }
  }

  return (
    <Sheet
      className="sm:max-w-lg"
      onClose={onClose}
      open={open}
      title={goal ? "Edit optional goal" : "Add optional goal"}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="optional-goal-name">Name</Label>
          <Input
            aria-describedby="optional-goal-name-help"
            id="optional-goal-name"
            maxLength={MAX_OPTIONAL_GOAL_NAME_CHARACTERS}
            onChange={(event) => setName(event.target.value)}
            placeholder="Meditate"
            value={name}
          />
          <p className="text-muted text-xs" id="optional-goal-name-help">
            Keep this personal; optional goals never affect your required score.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-foreground text-sm font-medium">
            Goal shape
          </legend>
          <label className="border-border bg-card flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm">
            <input
              checked={mode === "checkbox"}
              name="optional-goal-mode"
              onChange={() => setMode("checkbox")}
              type="radio"
            />
            <span>
              <span className="block font-medium">Checkbox</span>
              <span className="text-muted block text-xs">
                Mark it complete once each day.
              </span>
            </span>
          </label>
          <label className="border-border bg-card flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm">
            <input
              checked={mode === "numeric"}
              name="optional-goal-mode"
              onChange={() => setMode("numeric")}
              type="radio"
            />
            <span>
              <span className="block font-medium">Numeric target</span>
              <span className="text-muted block text-xs">
                Add progress toward a daily amount.
              </span>
            </span>
          </label>
        </fieldset>

        {mode === "numeric" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="optional-goal-target">Daily target</Label>
              <Input
                id="optional-goal-target"
                inputMode="decimal"
                min="0"
                onChange={(event) => setTargetValue(event.target.value)}
                placeholder="10"
                step="any"
                type="number"
                value={targetValue}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="optional-goal-unit">Unit</Label>
              <Input
                id="optional-goal-unit"
                maxLength={40}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="minutes"
                value={unit}
              />
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <p
            aria-live="assertive"
            className="text-sm text-red-700"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
        <MutationStatus state={status} />

        <div className="flex justify-end gap-3">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button disabled={status === "pending"} type="submit">
            {status === "pending" ? "Saving…" : "Save goal"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
