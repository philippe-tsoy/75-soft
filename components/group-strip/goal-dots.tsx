import { REQUIRED_GOALS, REQUIRED_GOAL_KEYS } from "@/lib/config/75-soft";
import type { GoalDotState, RequiredGoalKey } from "@/lib/types";

interface GoalDotsProps {
  states: GoalDotState;
  compact?: boolean;
}

const symbols: Record<RequiredGoalKey, string> = {
  workout: "W",
  water: "◆",
  reading: "R",
  diet: "D",
};

export function GoalDots({ states, compact = false }: GoalDotsProps) {
  return (
    <div
      aria-label="Required challenge status"
      className={`flex ${compact ? "gap-1" : "gap-2"}`}
      role="list"
    >
      {REQUIRED_GOAL_KEYS.map((key) => {
        const met = states[key];
        return (
          <span
            aria-label={`${REQUIRED_GOALS[key].label}: ${
              met ? "complete" : "not complete"
            }`}
            className={`inline-flex items-center justify-center rounded-full border text-xs font-bold ${
              compact ? "h-7 w-7" : "h-9 w-9"
            } ${
              met
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted"
            }`}
            key={key}
            role="listitem"
            title={`${REQUIRED_GOALS[key].label}: ${
              met ? "complete" : "not complete"
            }`}
          >
            <span aria-hidden="true">{symbols[key]}</span>
          </span>
        );
      })}
    </div>
  );
}
