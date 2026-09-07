"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Card, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { AmountInputMode } from "@/lib/types";

const OPTIONS: {
  value: AmountInputMode;
  label: string;
  description: string;
}[] = [
  {
    description:
      "Drag a marker from 0 to the target to set the total for the day.",
    label: "Slider",
    value: "slider",
  },
  {
    description:
      "Tap − and + on preset amounts, saved water containers, and a custom field.",
    label: "Buttons",
    value: "buttons",
  },
];

export interface AmountInputModeEditorProps {
  initialMode: AmountInputMode;
}

export function AmountInputModeEditor({
  initialMode,
}: AmountInputModeEditorProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AmountInputMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  async function selectMode(next: AmountInputMode) {
    if (next === mode || busy) {
      return;
    }

    const previous = mode;
    setMode(next);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountInputMode: next }),
      });

      if (!response.ok) {
        throw new Error("Unable to save the tracker layout.");
      }

      // Today renders the control on the server, so it needs a fresh pass.
      startRefresh(() => router.refresh());
    } catch (saveError) {
      setMode(previous);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the tracker layout.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="amount-input-mode-title">
      <CardHeader>
        <CardTitle id="amount-input-mode-title">Tracker layout</CardTitle>
        <p className="text-muted text-sm">
          Choose how you log workout, water, and reading amounts on Today.
        </p>
      </CardHeader>

      <div
        aria-label="Tracker layout"
        className="flex flex-wrap gap-2"
        role="radiogroup"
      >
        {OPTIONS.map((option) => (
          <button
            aria-checked={mode === option.value}
            className={cn(
              "focus-visible:ring-primary min-w-44 flex-1 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 disabled:opacity-60",
              mode === option.value
                ? "border-primary bg-surface-accent"
                : "border-border bg-card hover:bg-surface-accent",
            )}
            disabled={busy || isRefreshing}
            key={option.value}
            onClick={() => void selectMode(option.value)}
            role="radio"
            type="button"
          >
            <span className="block font-semibold">{option.label}</span>
            <span className="text-muted mt-1 block text-sm">
              {option.description}
            </span>
          </button>
        ))}
      </div>

      <p className="text-muted mt-3 text-xs">
        Saved water containers only appear in the button layout.
      </p>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
