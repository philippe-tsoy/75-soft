"use client";

import { useQuery } from "@tanstack/react-query";

import { BoardRow } from "@/components/board/board-row";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/feedback/async-state";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import { queryKeys } from "@/lib/query-keys";
import type { BoardEntryDTO } from "@/lib/types";

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

export function BoardScreen() {
  const board = useQuery({
    queryKey: queryKeys.board("current"),
    queryFn: fetchBoard,
  });

  return (
    <div className="space-y-5 py-6">
      <div>
        <p className="text-primary text-sm font-semibold tracking-wide">
          Daily standings
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Board</h1>
        <p className="text-muted mt-2 text-sm leading-6">
          Each member is scored on their own current local date. Ties share a
          rank.
        </p>
      </div>

      {board.isPending ? <LoadingState label="Loading today’s Board…" /> : null}

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
                Workout, water, reading, and diet for each member’s local today.
              </p>
            </CardHeader>
            <div className="space-y-2" role="list" aria-label="Board standings">
              {board.data.map((entry) => (
                <div key={entry.user.id} role="listitem">
                  <BoardRow entry={entry} />
                </div>
              ))}
            </div>
          </Card>
        )
      ) : null}
    </div>
  );
}
