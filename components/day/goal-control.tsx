import type { ReactNode } from "react";

import { Card } from "@/components/ui";
import type { GoalProgressDTO } from "@/lib/types";

interface GoalControlProps {
  title: string;
  progress: GoalProgressDTO;
  pending: boolean;
  children: ReactNode;
}

function formatAmount(value: number, unit: string | null | undefined): string {
  if (unit === "ml") {
    const liters = value / 1_000;
    return `${Number.isInteger(liters) ? liters : liters.toFixed(2)} L`;
  }

  return `${value} ${unit ?? ""}`.trim();
}

export function GoalControl({
  title,
  progress,
  pending,
  children,
}: GoalControlProps) {
  const amount =
    progress.amount !== undefined && progress.target !== undefined
      ? `${formatAmount(progress.amount, progress.unit)} / ${formatAmount(progress.target, progress.unit)}`
      : progress.met
        ? "Marked complete"
        : "Not marked complete";

  return (
    <Card
      aria-busy={pending}
      aria-label={`${title} challenge`}
      className="flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-muted mt-1 text-sm">{amount}</p>
        </div>
        <span
          aria-label={progress.met ? `${title} met` : `${title} not met`}
          className={
            progress.met
              ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
              : "rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
          }
        >
          {progress.met ? "Met" : "Open"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </Card>
  );
}
