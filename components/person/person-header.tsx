import Link from "next/link";

import { MemberAvatar } from "@/components/board/member-avatar";
import { Card } from "@/components/ui";
import type { PersonSummaryDTO } from "@/features/person/types";

interface PersonHeaderProps {
  person: PersonSummaryDTO;
}

export function PersonHeader({ person }: PersonHeaderProps) {
  return (
    <Card className="flex flex-wrap items-center gap-4">
      <MemberAvatar className="h-16 w-16 text-base" profile={person.profile} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold">
          {person.profile.displayName}
        </h1>
        <p className="text-muted mt-1 text-sm">
          {person.goalsAchievedToday} of 4 required challenges achieved today
        </p>
        <p className="text-muted mt-1 text-sm">
          {person.individualPct}% of the challenge complete so far
        </p>
      </div>
      {person.canEdit ? (
        <Link
          className="border-border bg-card text-foreground focus-visible:ring-primary hover:bg-surface-accent inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
          href="/me"
        >
          Edit
        </Link>
      ) : null}
    </Card>
  );
}
