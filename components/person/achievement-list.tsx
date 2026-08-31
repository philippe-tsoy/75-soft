import { EmptyState } from "@/components/feedback/async-state";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import type { AchievementDTO } from "@/lib/types";

interface AchievementListProps {
  achievements: AchievementDTO[];
}

export function AchievementList({ achievements }: AchievementListProps) {
  return (
    <Card aria-labelledby="person-achievements-title">
      <CardHeader>
        <CardTitle id="person-achievements-title">Achievements</CardTitle>
        <p className="text-muted text-sm">
          Earned badges and the hidden catalog are shown here.
        </p>
      </CardHeader>

      {achievements.length === 0 ? (
        <EmptyState message="Achievements will appear here." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Achievements">
          {achievements.map((achievement) => {
            const locked =
              achievement.isHidden && achievement.unlockedAt === null;
            return (
              <li
                className={`rounded-xl border p-3 ${
                  locked
                    ? "border-border bg-background text-muted"
                    : "border-emerald-200 bg-emerald-50"
                }`}
                key={achievement.code}
              >
                <p className="font-semibold">
                  {locked ? "???" : achievement.title}
                </p>
                <p className="mt-1 text-sm">
                  {locked ? "???" : achievement.description}
                </p>
                <p className="mt-2 text-xs font-semibold">
                  {locked
                    ? "Hidden"
                    : achievement.unlockedAt
                      ? `Unlocked ${achievement.unlockedAt}`
                      : "Available"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
