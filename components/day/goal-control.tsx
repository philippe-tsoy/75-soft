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
  /** Omitted for read-only cards; otherwise flips the manual done flag. */
  onToggleDone?: () => void;
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
}: GoalControlProps) {
  const amount =
    progress.amount !== undefined && progress.target !== undefined
      ? `${formatAmount(progress.amount, progress.unit)} / ${formatAmount(progress.target, progress.unit)}`
      : progress.met
        ? "Marked complete"
        : "Not marked complete";

  /*
   * `met` is `amount >= target or markedDone`, so once the logged amount
   * reaches the target the checkmark is already on and cannot be turned off
   * without lowering the amount. Below the target it is a free-standing
   * boolean the member can toggle either way.
   */
  const lockedByAmount =
    progress.amount !== undefined &&
    progress.target !== undefined &&
    progress.amount >= progress.target;
  const toggleDisabled = pending || lockedByAmount || !onToggleDone;

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
            lockedByAmount
              ? `${title} met, the logged amount reached the target`
              : progress.met
                ? `Mark ${title} not done`
                : `Mark ${title} done`
          }
          aria-pressed={progress.met}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            progress.met
              ? "border-primary bg-primary text-primary-foreground focus-visible:ring-primary"
              : "border-border bg-card text-muted focus-visible:ring-primary",
            toggleDisabled ? "cursor-default" : "hover:bg-surface-accent",
          )}
          disabled={toggleDisabled}
          onClick={onToggleDone}
          title={
            lockedByAmount
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
