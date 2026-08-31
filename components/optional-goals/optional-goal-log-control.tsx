"use client";

import { useRef, useState } from "react";

import { Button, Input } from "@/components/ui";
import { MutationStatus } from "@/components/feedback";
import { createOptionalGoalOperationId } from "@/features/optional-goals/client";
import type {
  OptionalGoalLogInput,
  OptionalGoalLogResultDTO,
  OptionalGoalWithMode,
} from "@/features/optional-goals/types";

interface OptionalGoalLogControlProps {
  goal: OptionalGoalWithMode;
  localDate: string;
  onLog: (input: OptionalGoalLogInput) => Promise<OptionalGoalLogResultDTO>;
}

export function OptionalGoalLogControl({
  goal,
  localDate,
  onLog,
}: OptionalGoalLogControlProps) {
  const [completed, setCompleted] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingInput = useRef<OptionalGoalLogInput | null>(null);

  function startNewAttempt() {
    pendingInput.current = null;
    setStatus("idle");
    setErrorMessage(null);
  }

  function handleCompletedChange(nextCompleted: boolean) {
    setCompleted(nextCompleted);
    if (status === "error") {
      startNewAttempt();
    }
  }

  function handleValueChange(nextValue: string) {
    setValue(nextValue);
    if (status === "error") {
      startNewAttempt();
    }
  }

  async function handleLog() {
    const input =
      pendingInput.current ??
      ({
        localDate,
        clientOperationId: createOptionalGoalOperationId(),
        ...(goal.mode === "checkbox"
          ? { completed }
          : { value: Number(value) }),
      } satisfies OptionalGoalLogInput);

    pendingInput.current = input;
    setStatus("pending");
    setErrorMessage(null);

    try {
      const result = await onLog(input);
      pendingInput.current = null;
      setStatus("success");
      if (goal.mode === "checkbox") {
        setCompleted(result.log.completed ?? completed);
      } else if (result.log.value !== null) {
        setValue("");
      }
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save this log. Try again.",
      );
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {goal.mode === "checkbox" ? (
        <label className="border-border bg-surface-accent flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-sm">
          <input
            aria-label={`Completed ${goal.name}`}
            checked={completed}
            className="min-h-5 min-w-5"
            disabled={status === "pending"}
            onChange={(event) => handleCompletedChange(event.target.checked)}
            type="checkbox"
          />
          <span>{completed ? "Completed today" : "Not completed today"}</span>
        </label>
      ) : (
        <div className="flex items-end gap-3">
          <label
            className="flex-1 space-y-2 text-sm font-medium"
            htmlFor={`optional-goal-value-${goal.id}`}
          >
            <span className="block">Add progress</span>
            <Input
              aria-label={`Progress for ${goal.name}`}
              disabled={status === "pending"}
              inputMode="decimal"
              min="0"
              onChange={(event) => handleValueChange(event.target.value)}
              placeholder={String(goal.targetValue)}
              step="any"
              type="number"
              value={value}
              id={`optional-goal-value-${goal.id}`}
            />
          </label>
          <span className="text-muted pb-3 text-sm">{goal.unit}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
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
        </div>
        <Button
          disabled={status === "pending"}
          onClick={handleLog}
          variant="secondary"
        >
          {status === "error" ? "Retry" : "Log"}
        </Button>
      </div>
    </div>
  );
}
