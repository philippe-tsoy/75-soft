import Link from "next/link";

import { MemberAvatar } from "@/components/board/member-avatar";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/feedback/async-state";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import { GoalDots } from "@/components/group-strip/goal-dots";
import type { GroupStripEntryDTO } from "@/features/board/types";

interface GroupStripProps {
  entries: GroupStripEntryDTO[];
}

export function GroupStrip({ entries }: GroupStripProps) {
  return (
    <Card aria-labelledby="group-strip-title" className="space-y-3">
      <CardHeader className="mb-2">
        <CardTitle id="group-strip-title">Your group</CardTitle>
        <p className="text-muted text-sm">
          Required challenges completed today by each member.
        </p>
      </CardHeader>

      {entries.length === 0 ? (
        <EmptyState message="No active members yet." />
      ) : (
        <div className="flex snap-x gap-3 overflow-x-auto pb-1" role="list">
          {entries.map((entry) => (
            <Link
              className="border-border bg-background focus-visible:ring-primary hover:bg-surface-accent flex min-w-44 snap-start flex-col gap-3 rounded-2xl border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              href={`/person/${encodeURIComponent(entry.user.id)}`}
              key={entry.user.id}
              role="listitem"
            >
              <div className="flex items-center gap-3">
                <MemberAvatar className="h-11 w-11" profile={entry.user} />
                <p className="truncate text-sm font-semibold">
                  {entry.user.displayName}
                </p>
              </div>
              <GoalDots compact states={entry.goalDots} />
              <p className="text-muted text-xs">
                <span className="text-foreground font-semibold">
                  {entry.goalsAchievedToday}/4
                </span>{" "}
                achieved ·{" "}
                <time dateTime={entry.scoreDate}>{entry.scoreDate}</time>
              </p>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export function GroupStripLoading() {
  return <LoadingState label="Loading your group…" />;
}

export function GroupStripError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      message="The group tracker could not be loaded."
      onRetry={onRetry}
    />
  );
}

export function GroupStripUnauthorized() {
  return <UnauthorizedState />;
}
