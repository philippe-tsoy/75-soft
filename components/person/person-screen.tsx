"use client";

import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/feedback/async-state";
import { AchievementList } from "@/components/person/achievement-list";
import { CalendarGrid } from "@/components/person/calendar-grid";
import { CurrentDay } from "@/components/person/current-day";
import { PersonHeader } from "@/components/person/person-header";
import { PostList } from "@/components/person/post-list";
import { queryKeys } from "@/lib/query-keys";
import type { PersonSummaryDTO } from "@/features/person/types";

class PersonRequestError extends Error {
  readonly unauthorized: boolean;

  constructor(message: string, unauthorized = false) {
    super(message);
    this.name = "PersonRequestError";
    this.unauthorized = unauthorized;
  }
}

async function fetchPerson(userId: string): Promise<PersonSummaryDTO> {
  const response = await fetch(`/api/profiles/${encodeURIComponent(userId)}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new PersonRequestError(
      response.status === 404
        ? "This member could not be found."
        : "This Person view could not be loaded.",
      response.status === 401 || response.status === 403,
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("data" in payload) ||
    !payload.data ||
    typeof payload.data !== "object"
  ) {
    throw new PersonRequestError(
      "The Person view returned an invalid response.",
    );
  }

  return payload.data as PersonSummaryDTO;
}

export function PersonScreen({ userId }: { userId: string }) {
  const person = useQuery({
    queryKey: queryKeys.person(userId),
    queryFn: () => fetchPerson(userId),
    enabled: userId.length > 0,
  });

  return (
    <div className="space-y-5 py-6">
      {person.isPending ? <LoadingState label="Loading Person view…" /> : null}

      {person.isError && person.error instanceof PersonRequestError ? (
        person.error.unauthorized ? (
          <UnauthorizedState />
        ) : (
          <ErrorState
            message={person.error.message}
            onRetry={() => void person.refetch()}
          />
        )
      ) : null}

      {person.isError && !(person.error instanceof PersonRequestError) ? (
        <ErrorState onRetry={() => void person.refetch()} />
      ) : null}

      {person.isSuccess ? (
        person.data ? (
          <>
            <PersonHeader person={person.data} />
            <CalendarGrid cells={person.data.calendar} />
            <CurrentDay day={person.data.currentDay} />
            <AchievementList achievements={person.data.achievements} />
            <PostList posts={person.data.posts} />
          </>
        ) : (
          <EmptyState message="This member could not be found." />
        )
      ) : null}
    </div>
  );
}
