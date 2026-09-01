"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BoardRow } from "@/components/board/board-row";
import { TeamBoardRow } from "@/components/teams/team-board-row";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/feedback/async-state";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui";
import { queryKeys } from "@/lib/query-keys";
import type { BoardEntryDTO, TeamBoardEntryDTO } from "@/lib/types";

class BoardRequestError extends Error {
  readonly unauthorized: boolean;

  constructor(message: string, unauthorized = false) {
    super(message);
    this.name = "BoardRequestError";
    this.unauthorized = unauthorized;
  }
}

async function fetchBoard(): Promise<BoardEntryDTO[]> {
  const response = await fetch("/api/board", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new BoardRequestError(
      "The Board could not be loaded.",
      response.status === 401 || response.status === 403,
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("data" in payload) ||
    !Array.isArray(payload.data)
  ) {
    throw new BoardRequestError("The Board returned an invalid response.");
  }

  return payload.data as BoardEntryDTO[];
}

interface TeamsResponse {
  teams: TeamBoardEntryDTO[];
  globalPct: number;
}

async function fetchTeamBoard(): Promise<TeamsResponse> {
  const response = await fetch("/api/teams", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new BoardRequestError(
      "The Teams board could not be loaded.",
      response.status === 401 || response.status === 403,
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("data" in payload) ||
    typeof payload.data !== "object" ||
    payload.data === null
  ) {
    throw new BoardRequestError("The Teams board returned an invalid response.");
  }

  return payload.data as TeamsResponse;
}

export function BoardScreen() {
  const [view, setView] = useState<"individual" | "teams">("individual");
  const board = useQuery({
    queryKey: queryKeys.board("current"),
    queryFn: fetchBoard,
    enabled: view === "individual",
  });
  const teamBoard = useQuery({
    queryKey: queryKeys.teams(),
    queryFn: fetchTeamBoard,
    enabled: view === "teams",
  });

  return (
    <div className="space-y-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-semibold tracking-wide">
            Daily standings
          </p>
          <h1 className="mt-1 text-3xl font-semibold">Board</h1>
          <p className="text-muted mt-2 text-sm leading-6">
            Each member is scored on their own current local date. Ties share a
            rank.
          </p>
          {teamBoard.isSuccess ? (
            <p className="text-muted mt-2 text-sm">
              Group percentage completion: {teamBoard.data.globalPct}%
            </p>
          ) : null}
        </div>
        <Button
          disabled={view === "individual" ? board.isFetching : teamBoard.isFetching}
          onClick={() =>
            void (view === "individual" ? board.refetch() : teamBoard.refetch())
          }
          variant="secondary"
        >
          {(view === "individual" ? board.isFetching : teamBoard.isFetching)
            ? "Refreshing…"
            : "Refresh"}
        </Button>
      </div>

      <div
        aria-label="Board view"
        className="border-border bg-card inline-flex rounded-xl border p-1"
        role="group"
      >
        <Button
          aria-pressed={view === "individual"}
          onClick={() => setView("individual")}
          variant={view === "individual" ? "primary" : "ghost"}
        >
          Individual
        </Button>
        <Button
          aria-pressed={view === "teams"}
          onClick={() => setView("teams")}
          variant={view === "teams" ? "primary" : "ghost"}
        >
          Teams
        </Button>
      </div>

      {view === "individual" ? (
        <>
          {board.isPending ? (
            <LoadingState label="Loading today’s Board…" />
          ) : null}

          {board.isError && board.error instanceof BoardRequestError ? (
            board.error.unauthorized ? (
              <UnauthorizedState />
            ) : (
              <ErrorState
                message={board.error.message}
                onRetry={() => void board.refetch()}
              />
            )
          ) : null}

          {board.isError && !(board.error instanceof BoardRequestError) ? (
            <ErrorState onRetry={() => void board.refetch()} />
          ) : null}

          {board.isSuccess ? (
            board.data.length === 0 ? (
              <EmptyState message="No active members yet." />
            ) : (
              <Card className="space-y-3">
                <CardHeader className="mb-2">
                  <CardTitle>Required challenges achieved</CardTitle>
                  <p className="text-muted text-sm">
                    Workout, water, reading, and diet for each member’s local
                    today.
                  </p>
                </CardHeader>
                <div
                  className="space-y-2"
                  role="list"
                  aria-label="Board standings"
                >
                  {board.data.map((entry) => (
                    <div key={entry.user.id} role="listitem">
                      <BoardRow entry={entry} />
                    </div>
                  ))}
                </div>
              </Card>
            )
          ) : null}
        </>
      ) : (
        <>
          {teamBoard.isPending ? (
            <LoadingState label="Loading teams…" />
          ) : null}

          {teamBoard.isError && teamBoard.error instanceof BoardRequestError ? (
            teamBoard.error.unauthorized ? (
              <UnauthorizedState />
            ) : (
              <ErrorState
                message={teamBoard.error.message}
                onRetry={() => void teamBoard.refetch()}
              />
            )
          ) : null}

          {teamBoard.isError && !(teamBoard.error instanceof BoardRequestError) ? (
            <ErrorState onRetry={() => void teamBoard.refetch()} />
          ) : null}

          {teamBoard.isSuccess ? (
            teamBoard.data.teams.length === 0 ? (
              <EmptyState message="No teams yet." />
            ) : (
              <Card className="space-y-3">
                <CardHeader className="mb-2">
                  <CardTitle>Percentage completion</CardTitle>
                  <p className="text-muted text-sm">
                    Cumulative required-goal-days completed since each member
                    joined.
                  </p>
                </CardHeader>
                <div className="space-y-2" role="list" aria-label="Team standings">
                  {teamBoard.data.teams.map((entry) => (
                    <div key={entry.teamId} role="listitem">
                      <TeamBoardRow entry={entry} />
                    </div>
                  ))}
                </div>
              </Card>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
