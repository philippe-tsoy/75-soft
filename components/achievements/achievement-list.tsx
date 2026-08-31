import type { AchievementDTO } from "@/lib/types";

import { AchievementCard } from "./achievement-card";

export interface AchievementListProps {
  achievements: readonly AchievementDTO[];
  title?: string;
}

export function AchievementList({
  achievements,
  title = "Achievements",
}: AchievementListProps) {
  return (
    <section aria-labelledby="achievements-heading">
      <h2
        className="text-foreground text-lg font-semibold"
        id="achievements-heading"
      >
        {title}
      </h2>
      {achievements.length === 0 ? (
        <p className="text-muted mt-3 text-sm">No achievements yet.</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {achievements.map((achievement) => (
            <AchievementCard achievement={achievement} key={achievement.code} />
          ))}
        </ul>
      )}
    </section>
  );
}
