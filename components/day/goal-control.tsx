import Link from "next/link";
import type { ReactNode } from "react";

import { Button, Card } from "@/components/ui";
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
  /** This card's own failed-mutation message, if any. */
  error?: string | null;
  sessionExpired?: boolean;
  /** Re-attempts the failed mutation with the same idempotency key. */
  onRetry?: () => void;
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
  error,
  sessionExpired,
  onRetry,
}: GoalControlProps) {
  const amount =
    progress.amount !== undefined && progress.target !== undefined
      ? `${formatAmount(progress.amount, progress.unit)} / ${formatAmount(progress.target, progress.unit)}`
      : progress.met
        ? "Marked complete"
        : "Not marked complete";

  /*
   * `met` is `amount >= target or markedDone`, so once the logged amount
   * itself reaches the target, the checkmark just reflects that and can't
   * be un-toggled — there's no "previous amount" to go back to. Below the
   * target, markedDone is an independent, server-persisted flag the member
   * can freely flip either way.
   */
  const effectiveLocked =
    progress.amount !== undefined &&
    progress.target !== undefined &&
    progress.amount >= progress.target;
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
            {progress.isPrivate ? (
              <span className="text-muted rounded-full border border-current px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                Private
              </span>
            ) : null}
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
      {error ? (
        <div
          aria-live="assertive"
          className="flex flex-wrap items-center gap-3 text-sm text-red-700"
          role="alert"
        >
          <p>{error}</p>
          {onRetry ? (
            <Button disabled={pending} onClick={onRetry} variant="secondary">
              Retry
            </Button>
          ) : null}
          {sessionExpired ? (
            <Link
              className="font-semibold underline underline-offset-2"
              href="/login"
            >
              Sign in again
            </Link>
          ) : null}
        </div>
      ) : null}
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </Card>
  );
}
