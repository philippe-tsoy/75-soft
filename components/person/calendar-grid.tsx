import { EmptyState } from "@/components/feedback/async-state";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import type { CalendarCellDTO } from "@/lib/types";

interface CalendarGridProps {
  cells: CalendarCellDTO[];
}

const statusLabels: Record<CalendarCellDTO["status"], string> = {
  unscored: "Unscored",
  future: "Future",
  open: "Not started",
  in_progress: "In progress",
  partial: "Partial",
  complete: "Complete",
  missed: "Missed",
};

const statusClasses: Record<CalendarCellDTO["status"], string> = {
  unscored: "border-border bg-background text-muted",
  future: "border-border bg-card text-muted opacity-60",
  open: "border-border bg-card text-muted",
  in_progress: "border-amber-200 bg-amber-50 text-amber-900",
  partial: "border-amber-200 bg-amber-50 text-amber-900",
  complete: "border-emerald-200 bg-emerald-50 text-emerald-900",
  missed: "border-red-200 bg-red-50 text-red-900",
};

function shortDate(localDate: string): string {
  const [, month, day] = localDate.split("-");
  return month && day ? `${month}/${day}` : localDate;
}

export function CalendarGrid({ cells }: CalendarGridProps) {
  return (
    <Card aria-labelledby="person-calendar-title">
      <CardHeader>
        <CardTitle id="person-calendar-title">Required-goal calendar</CardTitle>
        <p className="text-muted text-sm">
          Progress is descriptive; each challenge is scored independently.
        </p>
      </CardHeader>

      {cells.length === 0 ? (
        <EmptyState message="Calendar data is not available yet." />
      ) : (
        <div
          aria-label="Required-goal calendar"
          className="grid grid-cols-5 gap-2 sm:grid-cols-7"
          role="list"
        >
          {cells.map((cell) => (
            <div
              aria-label={`${cell.localDate}: ${statusLabels[cell.status]}, ${cell.metCount} of 4 goals`}
              className={`min-h-16 rounded-xl border p-2 text-center ${statusClasses[cell.status]}`}
              key={cell.localDate}
              role="listitem"
              title={`${cell.localDate}: ${statusLabels[cell.status]}`}
            >
              <time
                className="block text-xs font-semibold"
                dateTime={cell.localDate}
              >
                {shortDate(cell.localDate)}
              </time>
              <span className="mt-1 block text-xs">
                {statusLabels[cell.status]}
              </span>
              {cell.status !== "unscored" && cell.status !== "future" ? (
                <span className="mt-1 block text-[11px] font-semibold tabular-nums">
                  {cell.metCount}/4
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
