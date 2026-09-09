"use client";

import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/feedback/async-state";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui";
import { queryKeys } from "@/lib/query-keys";
import type { MemberStatsDTO } from "@/lib/types";

class StatsRequestError extends Error {
  readonly unauthorized: boolean;

  constructor(message: string, unauthorized = false) {
    super(message);
    this.name = "StatsRequestError";
    this.unauthorized = unauthorized;
  }
}

async function fetchStats(): Promise<MemberStatsDTO> {
  const response = await fetch("/api/stats", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new StatsRequestError(
      "Your stats could not be loaded.",
      response.status === 401 || response.status === 403,
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("data" in payload) ||
    !payload.data
  ) {
    throw new StatsRequestError("Stats returned an invalid response.");
  }

  return payload.data as MemberStatsDTO;
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      aria-hidden="true"
      className="bg-surface-accent h-2 w-full overflow-hidden rounded-full"
    >
      <div
        className="bg-primary h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function GoalStatRow({
  goalId,
  name,
  active,
  metDays,
  eligibleDays,
  pct,
}: {
  goalId: string;
  name: string;
  active: boolean;
  metDays: number;
  eligibleDays: number;
  pct: number;
}) {
  return (
    <li className="space-y-2" key={goalId}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate font-semibold">
          {name}
          {!active ? (
            <span className="text-muted ml-2 text-xs font-normal">Removed</span>
          ) : null}
        </p>
        <p className="text-muted shrink-0 text-sm tabular-nums">
          {metDays}/{eligibleDays} · {pct}%
        </p>
      </div>
      <ProgressBar pct={pct} />
    </li>
  );
}

export function StatsScreen() {
  const stats = useQuery({
    queryKey: queryKeys.stats("me"),
    queryFn: fetchStats,
  });

  return (
    <div className="space-y-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-semibold tracking-wide">
            Personal analysis
          </p>
          <h1 className="mt-1 text-3xl font-semibold">Stats</h1>
        </div>
        <Button
          disabled={stats.isFetching}
          onClick={() => void stats.refetch()}
          variant="secondary"
        >
          {stats.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {stats.isPending ? <LoadingState label="Loading your stats…" /> : null}

      {stats.isError && stats.error instanceof StatsRequestError ? (
        stats.error.unauthorized ? (
          <UnauthorizedState />
        ) : (
          <ErrorState
            message={stats.error.message}
            onRetry={() => void stats.refetch()}
          />
        )
      ) : null}

      {stats.isError && !(stats.error instanceof StatsRequestError) ? (
        <ErrorState onRetry={() => void stats.refetch()} />
      ) : null}

      {stats.isSuccess ? (
        <>
          <Card className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-muted text-sm font-semibold tracking-wide">
                  Day
                </p>
                <p className="text-4xl font-bold tracking-tight">
                  {stats.data.dayNumber}
                </p>
              </div>
              <div className="text-right">
                <p className="text-muted text-sm font-semibold tracking-wide">
                  Overall
                </p>
                <p className="text-4xl font-bold tracking-tight">
                  {stats.data.pct}%
                </p>
              </div>
            </div>
            <ProgressBar pct={stats.data.pct} />
            <p className="text-muted text-sm">
              {stats.data.metDays}/{stats.data.eligibleDays} goal-days met since
              you joined.
            </p>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>By goal</CardTitle>
              <p className="text-muted text-sm">
                How often each goal was met, over the days it existed.
              </p>
            </CardHeader>
            {stats.data.goals.length === 0 ? (
              <EmptyState message="No goals to analyze yet." />
            ) : (
              <ul className="space-y-4">
                {stats.data.goals.map((goal) => (
                  <GoalStatRow key={goal.goalId} {...goal} />
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
