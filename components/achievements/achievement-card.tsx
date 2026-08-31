import type { AchievementDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface AchievementCardProps {
  achievement: AchievementDTO;
}

export function AchievementCard({ achievement }: AchievementCardProps) {
  const locked = achievement.isHidden && achievement.unlockedAt === null;
  const title = locked ? "???" : achievement.title;
  const description = locked ? "???" : achievement.description;

  return (
    <li
      aria-label={locked ? "Locked achievement" : title}
      className={cn(
        "border-border bg-card flex min-h-28 items-start gap-3 rounded-2xl border p-4",
        locked && "opacity-75",
      )}
    >
      <span
        aria-label={locked ? "Locked" : "Unlocked"}
        className={cn(
          "flex min-h-11 min-w-11 items-center justify-center rounded-full text-sm font-bold",
          locked ? "bg-muted/20 text-muted" : "bg-surface-accent text-primary",
        )}
      >
        {locked ? "???" : "✓"}
      </span>
      <span className="min-w-0">
        <span className="text-foreground block font-semibold">{title}</span>
        <span className="text-muted mt-1 block text-sm">{description}</span>
      </span>
    </li>
  );
}
