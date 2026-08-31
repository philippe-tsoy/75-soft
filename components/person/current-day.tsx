import { REQUIRED_GOALS, REQUIRED_GOAL_KEYS } from "@/lib/config/75-soft";
import { GoalDots } from "@/components/group-strip/goal-dots";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import type { DayRollupDTO, GoalDotState } from "@/lib/types";

interface CurrentDayProps {
  day: DayRollupDTO;
}

function goalStates(day: DayRollupDTO): GoalDotState {
  return {
    workout: day.goals.workout.met,
    water: day.goals.water.met,
    reading: day.goals.reading.met,
    diet: day.goals.diet.met,
  };
}

export function CurrentDay({ day }: CurrentDayProps) {
  const states = goalStates(day);

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
          <GoalDots states={states} />
          <p className="text-right text-sm font-semibold">
            <span className="block text-2xl tabular-nums">
              {day.metCount}/4
            </span>
            <span className="text-muted text-xs">achieved</span>
          </p>
        </div>
        <ul
          className="grid gap-2 sm:grid-cols-2"
          aria-label="Current required challenges"
        >
          {REQUIRED_GOAL_KEYS.map((key) => (
            <li
              className="border-border flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
              key={key}
            >
              <span>{REQUIRED_GOALS[key].label}</span>
              <span
                className={
                  states[key] ? "font-semibold text-emerald-700" : "text-muted"
                }
              >
                {states[key] ? "Complete" : "Not complete"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
