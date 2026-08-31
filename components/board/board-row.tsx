import Link from "next/link";

import { MemberAvatar } from "@/components/board/member-avatar";
import type { BoardEntryDTO } from "@/lib/types";

interface BoardRowProps {
  entry: BoardEntryDTO;
}

export function BoardRow({ entry }: BoardRowProps) {
  return (
    <Link
      className="border-border bg-card focus-visible:ring-primary hover:bg-surface-accent grid min-h-20 grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-2xl border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[4rem_1fr_auto] sm:gap-4 sm:p-4"
      href={`/person/${encodeURIComponent(entry.user.id)}`}
    >
      <p
        aria-label={`Rank ${entry.rank}`}
        className="text-primary text-center text-lg font-bold tabular-nums"
      >
        {entry.rank}
      </p>
      <div className="flex min-w-0 items-center gap-3">
        <MemberAvatar
          className="h-11 w-11 sm:h-12 sm:w-12"
          profile={entry.user}
        />
        <div className="min-w-0">
          <p className="truncate font-semibold">{entry.user.displayName}</p>
          <p className="text-muted text-xs">
            Score date:{" "}
            <time dateTime={entry.scoreDate}>{entry.scoreDate}</time>
          </p>
        </div>
      </div>
      <p className="text-right text-sm font-semibold">
        <span className="block text-2xl leading-none tabular-nums">
          {entry.goalsAchievedToday}
        </span>
        <span className="text-muted text-xs whitespace-nowrap">of 4 today</span>
      </p>
    </Link>
  );
}
