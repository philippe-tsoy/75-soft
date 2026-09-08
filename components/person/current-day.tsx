import { Card, CardHeader, CardTitle } from "@/components/ui";
import type { DayRollupDTO } from "@/lib/types";

interface CurrentDayProps {
  day: DayRollupDTO;
}

export function CurrentDay({ day }: CurrentDayProps) {
  return (
    <Card aria-labelledby="current-day-title">
      <CardHeader>
        <CardTitle id="current-day-title">Current local day</CardTitle>
        <p className="text-muted text-sm">
          <time dateTime={day.localDate}>{day.localDate}</time> ·{" "}
          {day.status.replace("_", " ")}
        </p>
      </CardHeader>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-right text-sm font-semibold">
            <span className="block text-2xl tabular-nums">
              {day.metCount}/{day.totalCount}
            </span>
            <span className="text-muted text-xs">achieved</span>
          </p>
        </div>
        {day.goals.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Goals">
            {day.goals.map((goal) => (
              <li
                className="border-border flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                key={goal.id}
              >
                <span>{goal.name}</span>
                <span
                  className={
                    goal.met ? "font-semibold text-emerald-700" : "text-muted"
                  }
                >
                  {goal.met ? "Complete" : "Not complete"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-sm">No goals yet.</p>
        )}
      </div>
    </Card>
  );
}
