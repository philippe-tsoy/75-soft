import type { ReactNode } from "react";

import { Card } from "@/components/ui";
import type { GoalProgressDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GoalControlProps {
  title: string;
  progress: GoalProgressDTO;
  pending: boolean;
  children?: ReactNode;
  titleAction?: ReactNode;
  /** Omitted for read-only cards; otherwise flips or acts on the checkmark. */
  onToggleDone?: () => void;
  /**
   * Overrides the default "locked once amount >= target" rule. The caller
   * knows whether the goal reached its target through a reversible action
   * (e.g. the checkmark's own fill) or an irreversible one (dragging the
   * slider itself), which this component has no way to tell apart on its
   * own. Omit to fall back to the amount-based rule (used by the diet
   * card, which has no amount/target at all).
   */
  toggleLocked?: boolean;
}

function formatAmount(value: number, unit: string | null | undefined): string {
  if (unit === "ml") {
    const liters = value / 1_000;
    return `${Number.isInteger(liters) ? liters : liters.toFixed(2)} L`;
  }

  return `${value} ${unit ?? ""}`.trim();
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={18}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.6}
      viewBox="0 0 24 24"
      width={18}
    >
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

export function GoalControl({
  title,
  progress,
  pending,
  children,
  titleAction,
  onToggleDone,
  toggleLocked,
}: GoalControlProps) {
  const amount =
    progress.amount !== undefined && progress.target !== undefined
      ? `${formatAmount(progress.amount, progress.unit)} / ${formatAmount(progress.target, progress.unit)}`
      : progress.met
        ? "Marked complete"
        : "Not marked complete";

  /*
   * `met` is `amount >= target or markedDone`, so once the logged amount
   * reaches the target the checkmark is already on. The caller can override
   * this default lock (see `toggleLocked` doc) when it reached the target
   * through a reversible action of its own.
   */
  const lockedByAmount =
    progress.amount !== undefined &&
    progress.target !== undefined &&
    progress.amount >= progress.target;
  const effectiveLocked = toggleLocked ?? lockedByAmount;
  const toggleDisabled = pending || effectiveLocked || !onToggleDone;

  return (
    <Card
      aria-busy={pending}
      aria-label={`${title} challenge`}
      className="flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{title}</h2>
            {titleAction}
          </div>
          <p className="text-muted mt-1 text-sm">{amount}</p>
        </div>
        <button
          aria-label={
            effectiveLocked
              ? `${title} met, the logged amount reached the target`
              : progress.met
                ? `Mark ${title} not done`
                : `Mark ${title} done`
          }
          aria-pressed={progress.met}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 opacity-100 transition-[opacity,background-color,color] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            progress.met
              ? "border-primary bg-primary text-primary-foreground focus-visible:ring-primary"
              : "border-border bg-card text-muted focus-visible:ring-primary",
            // Explicit disabled opacity, animated: without it the browser's
            // own (unanimated) disabled styling reads as an instant flash
            // during the brief round trip after a commit.
            toggleDisabled
              ? "cursor-default opacity-70"
              : "hover:bg-surface-accent",
          )}
          disabled={toggleDisabled}
          onClick={onToggleDone}
          title={
            effectiveLocked
              ? "Met automatically because the logged amount reached the target"
              : undefined
          }
          type="button"
        >
          <CheckIcon />
        </button>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </Card>
  );
}
