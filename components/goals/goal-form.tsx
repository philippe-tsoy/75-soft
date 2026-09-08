"use client";

import { useState, type FormEvent } from "react";

import { Button, Input, Label } from "@/components/ui";
import { Sheet } from "@/components/sheets/sheet";
import { GoalApiError, createGoal, updateGoal } from "@/components/goals/api";
import type { GoalCreateInput } from "@/features/goals/types";
import type { GoalDTO, GoalTemplateDTO } from "@/lib/types";
import { MAX_GOAL_NAME_CHARACTERS } from "@/lib/config/75-soft";
import { MutationStatus } from "@/components/feedback";
import { goalInputSchema } from "@/lib/validation";

interface GoalFormProps {
  open: boolean;
  goal: GoalDTO | null;
  /** Suggestions shown above the form on a new (non-edit) goal. */
  templates?: GoalTemplateDTO[];
  onClose: () => void;
  onSaved: (goal: GoalDTO) => void | Promise<void>;
}

type FormMode = "checkbox" | "numeric";

export function GoalForm({
  open,
  goal,
  templates = [],
  onClose,
  onSaved,
}: GoalFormProps) {
  const [name, setName] = useState(goal?.name ?? "");
  const [mode, setMode] = useState<FormMode>(
    goal?.targetValue === null || goal?.targetValue === undefined
      ? "checkbox"
      : "numeric",
  );
  const [targetValue, setTargetValue] = useState(
    goal?.targetValue === null || goal?.targetValue === undefined
      ? ""
      : String(goal.targetValue),
  );
  const [unit, setUnit] = useState(goal?.unit ?? "");
  const [isPrivate, setIsPrivate] = useState(goal?.isPrivate ?? false);
  const [templateId, setTemplateId] = useState<string | null>(
    goal?.templateId ?? null,
  );
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function applyTemplate(template: GoalTemplateDTO) {
    setName(template.name);
    setMode(template.targetValue === null ? "checkbox" : "numeric");
    setTargetValue(
      template.targetValue === null ? "" : String(template.targetValue),
    );
    setUnit(template.unit ?? "");
    setTemplateId(template.id);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const numericTarget = mode === "numeric" ? Number(targetValue) : null;
    const candidate = {
      name,
      targetValue: numericTarget,
      unit: mode === "numeric" ? unit : null,
    };
    const parsed = goalInputSchema.safeParse(candidate);

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

    const input: GoalCreateInput = {
      name: parsed.data.name,
      targetValue: parsed.data.targetValue ?? null,
      unit: parsed.data.unit ?? null,
      isPrivate,
      templateId,
    };

    setStatus("pending");

    try {
      const saved = goal
        ? await updateGoal(goal.id, input)
        : await createGoal(input);
      await onSaved(saved);
      setStatus("success");
      onClose();
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof GoalApiError
          ? error.message
          : "Could not save this goal. Try again.",
      );
    }
  }

  return (
    <Sheet
      className="sm:max-w-lg"
      onClose={onClose}
      open={open}
      title={goal ? "Edit goal" : "Add a goal"}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {!goal && templates.length > 0 ? (
          <div className="space-y-2">
            <p className="text-foreground text-sm font-medium">
              Start from a suggestion
            </p>
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <button
                  className="border-border bg-card hover:bg-surface-accent focus-visible:ring-primary rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-2"
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                  type="button"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="goal-name">Name</Label>
          <Input
            aria-describedby="goal-name-help"
            id="goal-name"
            maxLength={MAX_GOAL_NAME_CHARACTERS}
            onChange={(event) => {
              setName(event.target.value);
              setTemplateId(null);
            }}
            placeholder="Meditate"
            value={name}
          />
          <p className="text-muted text-xs" id="goal-name-help">
            You can remove this goal later; existing history stays intact.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-foreground text-sm font-medium">
            Goal shape
          </legend>
          <label className="border-border bg-card flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm">
            <input
              checked={mode === "checkbox"}
              name="goal-mode"
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
              name="goal-mode"
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
              <Label htmlFor="goal-target">Daily target</Label>
              <Input
                id="goal-target"
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
              <Label htmlFor="goal-unit">Unit</Label>
              <Input
                id="goal-unit"
                maxLength={40}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="minutes"
                value={unit}
              />
            </div>
          </div>
        ) : null}

        <label className="border-border bg-card flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm">
          <input
            checked={isPrivate}
            onChange={(event) => setIsPrivate(event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="block font-medium">Private</span>
            <span className="text-muted block text-xs">
              Still counts toward your own percentage and rank, but shows as
              &quot;Secret goal&quot; to everyone else, including in Posts.
            </span>
          </span>
        </label>

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
