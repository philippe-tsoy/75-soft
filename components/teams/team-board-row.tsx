import Link from "next/link";

import type { TeamBoardEntryDTO } from "@/lib/types";

interface TeamBoardRowProps {
  entry: TeamBoardEntryDTO;
}

export function TeamBoardRow({ entry }: TeamBoardRowProps) {
  return (
    <Link
      className="border-border bg-card focus-visible:ring-primary hover:bg-surface-accent grid min-h-20 grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-2xl border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[4rem_1fr_auto] sm:gap-4 sm:p-4"
      href={`/team/${encodeURIComponent(entry.teamId)}`}
    >
      <p
        aria-label={`Rank ${entry.rank}`}
        className="text-primary text-center text-lg font-bold tabular-nums"
      >
        {entry.rank}
      </p>
      <div className="min-w-0">
        <p className="truncate font-semibold">{entry.name}</p>
        <p className="text-muted text-xs">
          {entry.memberCount} member{entry.memberCount === 1 ? "" : "s"}
        </p>
      </div>
      <p className="text-right text-sm font-semibold">
        <span className="block text-2xl leading-none tabular-nums">
          {entry.pct}%
        </span>
        <span className="text-muted text-xs whitespace-nowrap">complete</span>
      </p>
    </Link>
  );
}
