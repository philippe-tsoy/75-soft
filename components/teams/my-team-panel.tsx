"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/feedback/async-state";
import { Button, Card, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { queryKeys } from "@/lib/query-keys";
import type { MyTeamDTO, TeamBoardEntryDTO } from "@/lib/types";

interface MyTeamPanelProps {
  userId: string;
}

interface ApiErrorBody {
  error?: { message?: string };
}

async function requestJson<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | { data?: T }
    | ApiErrorBody
    | null;

  if (!response.ok) {
    const message =
      body && "error" in body
        ? (body.error?.message ?? "Something went wrong.")
        : "Something went wrong.";
    throw new Error(message);
  }

  return (body as { data: T })?.data as T;
}

function fetchMyTeam(): Promise<MyTeamDTO | null> {
  return requestJson<MyTeamDTO | null>("/api/teams/me");
}

function fetchTeams(): Promise<{ teams: TeamBoardEntryDTO[]; globalPct: number }> {
  return requestJson<{ teams: TeamBoardEntryDTO[]; globalPct: number }>(
    "/api/teams",
  );
}

export function MyTeamPanel({ userId }: MyTeamPanelProps) {
  const queryClient = useQueryClient();
  const [newTeamName, setNewTeamName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const myTeam = useQuery({
    queryKey: queryKeys.myTeam(userId),
    queryFn: fetchMyTeam,
  });
  const teams = useQuery({
    queryKey: queryKeys.teams(),
    queryFn: fetchTeams,
    enabled: myTeam.isSuccess && !myTeam.data,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.myTeam(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.teams() });
  }

  const createTeam = useMutation({
    mutationFn: (name: string) =>
      requestJson<{ teamId: string }>("/api/teams", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      setNewTeamName("");
      setFormError(null);
      invalidate();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const joinTeam = useMutation({
    mutationFn: (teamId: string) =>
      requestJson<MyTeamDTO | null>(`/api/teams/${teamId}/join`, {
        method: "POST",
      }),
    onSuccess: invalidate,
  });

  const leaveTeam = useMutation({
    mutationFn: () =>
      fetch("/api/teams/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    onSuccess: invalidate,
  });

  function submitCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newTeamName.trim();
    if (trimmed.length < 2 || trimmed.length > 40) {
      setFormError("Team names must be 2–40 characters.");
      return;
    }

    createTeam.mutate(trimmed);
  }

  return (
    <Card className="space-y-4">
      <CardHeader>
        <CardTitle>My team</CardTitle>
        <p className="text-muted text-sm">
          Optional. Teams pool everyone's percentage completion together and
          never affect scoring.
        </p>
      </CardHeader>

      {myTeam.isPending ? <LoadingState label="Loading your team…" /> : null}
      {myTeam.isError ? (
        <ErrorState
          message="Your team could not be loaded."
          onRetry={() => void myTeam.refetch()}
        />
      ) : null}

      {myTeam.isSuccess && myTeam.data ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{myTeam.data.name}</p>
            <p className="text-muted text-sm">
              You: {myTeam.data.individualPct}% · Team:{" "}
              {myTeam.data.teamPct}%
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className="border-border bg-card text-foreground hover:bg-surface-accent focus-visible:ring-primary inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
              href={`/team/${myTeam.data.teamId}`}
            >
              View team
            </Link>
            <Button
              disabled={leaveTeam.isPending}
              onClick={() => leaveTeam.mutate()}
              variant="secondary"
            >
              Leave
            </Button>
          </div>
        </div>
      ) : null}

      {myTeam.isSuccess && !myTeam.data ? (
        <div className="space-y-4">
          <form className="flex flex-wrap gap-2" onSubmit={submitCreateTeam}>
            <Label className="sr-only" htmlFor="new-team-name">
              New team name
            </Label>
            <Input
              disabled={createTeam.isPending}
              id="new-team-name"
              maxLength={40}
              onChange={(event) => {
                setNewTeamName(event.target.value);
                setFormError(null);
              }}
              placeholder="Name a new team"
              value={newTeamName}
            />
            <Button disabled={createTeam.isPending} type="submit">
              Create
            </Button>
          </form>
          {formError ? (
            <p className="text-sm text-red-700" role="alert">
              {formError}
            </p>
          ) : null}

          {teams.isPending ? <LoadingState label="Loading teams…" /> : null}
          {teams.isSuccess && teams.data.teams.length === 0 ? (
            <EmptyState message="No teams yet. Create the first one." />
          ) : null}
          {teams.isSuccess && teams.data.teams.length > 0 ? (
            <div className="space-y-2">
              {teams.data.teams.map((team) => (
                <div
                  className="border-border bg-card flex items-center justify-between gap-3 rounded-xl border p-3"
                  key={team.teamId}
                >
                  <div>
                    <p className="font-semibold">{team.name}</p>
                    <p className="text-muted text-sm">
                      {team.memberCount} member
                      {team.memberCount === 1 ? "" : "s"} · {team.pct}%
                    </p>
                  </div>
                  <Button
                    disabled={joinTeam.isPending}
                    onClick={() => joinTeam.mutate(team.teamId)}
                    variant="secondary"
                  >
                    Join
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
