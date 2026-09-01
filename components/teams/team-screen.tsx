"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MemberAvatar } from "@/components/board/member-avatar";
import { ErrorState, LoadingState } from "@/components/feedback/async-state";
import { Button, Card, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { queryKeys } from "@/lib/query-keys";
import type { TeamSummaryDTO } from "@/lib/types";

interface TeamScreenProps {
  teamId: string;
  initialSummary: TeamSummaryDTO;
  viewerId: string;
  viewerIsAdmin: boolean;
  viewerTeamId: string | null;
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

export function TeamScreen({
  teamId,
  initialSummary,
  viewerId,
  viewerIsAdmin,
  viewerTeamId,
}: TeamScreenProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(initialSummary.name);
  const [renameError, setRenameError] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: queryKeys.team(teamId),
    queryFn: () => requestJson<TeamSummaryDTO>(`/api/teams/${teamId}`),
    initialData: initialSummary,
  });

  const canRename =
    viewerIsAdmin || summary.data.createdBy === viewerId;
  const isMyTeam = viewerTeamId === teamId;

  function refreshEverything() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.team(teamId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.myTeam(viewerId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.teams() });
    router.refresh();
  }

  const join = useMutation({
    mutationFn: () =>
      requestJson(`/api/teams/${teamId}/join`, { method: "POST" }),
    onSuccess: refreshEverything,
  });

  const leave = useMutation({
    mutationFn: () =>
      fetch("/api/teams/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    onSuccess: refreshEverything,
  });

  const rename = useMutation({
    mutationFn: (nextName: string) =>
      requestJson<TeamSummaryDTO>(`/api/teams/${teamId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: nextName }),
      }),
    onSuccess: () => {
      setRenameOpen(false);
      setRenameError(null);
      refreshEverything();
    },
    onError: (error: Error) => setRenameError(error.message),
  });

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 40) {
      setRenameError("Team names must be 2–40 characters.");
      return;
    }

    rename.mutate(trimmed);
  }

  if (summary.isError) {
    return (
      <ErrorState
        message="This team could not be loaded."
        onRetry={() => void summary.refetch()}
      />
    );
  }

  const team = summary.data;

  return (
    <div className="space-y-5 py-6">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide">
              Team
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{team.name}</h1>
            <p className="text-muted mt-1 text-sm">
              {team.memberCount} member{team.memberCount === 1 ? "" : "s"} ·{" "}
              {team.pct}% complete
            </p>
          </div>
          <div className="flex gap-2">
            {isMyTeam ? (
              <Button
                disabled={leave.isPending}
                onClick={() => leave.mutate()}
                variant="secondary"
              >
                Leave
              </Button>
            ) : (
              <Button disabled={join.isPending} onClick={() => join.mutate()}>
                Join this team
              </Button>
            )}
          </div>
        </div>

        {canRename ? (
          <div className="border-border border-t pt-3">
            {renameOpen ? (
              <form className="flex flex-wrap gap-2" onSubmit={submitRename}>
                <Label className="sr-only" htmlFor="team-rename">
                  Team name
                </Label>
                <Input
                  disabled={rename.isPending}
                  id="team-rename"
                  maxLength={40}
                  onChange={(event) => {
                    setName(event.target.value);
                    setRenameError(null);
                  }}
                  value={name}
                />
                <Button disabled={rename.isPending} type="submit">
                  Save
                </Button>
                <Button
                  onClick={() => setRenameOpen(false)}
                  type="button"
                  variant="secondary"
                >
                  Cancel
                </Button>
                {renameError ? (
                  <p className="basis-full text-sm text-red-700" role="alert">
                    {renameError}
                  </p>
                ) : null}
              </form>
            ) : (
              <Button onClick={() => setRenameOpen(true)} variant="secondary">
                Rename team
              </Button>
            )}
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <CardHeader>
          <CardTitle>Roster</CardTitle>
        </CardHeader>
        {summary.isPending ? <LoadingState label="Loading roster…" /> : null}
        <div className="space-y-2" role="list" aria-label="Team roster">
          {team.roster.map((member) => (
            <div
              className="border-border bg-card flex items-center justify-between gap-3 rounded-xl border p-3"
              key={member.userId}
              role="listitem"
            >
              <div className="flex min-w-0 items-center gap-3">
                <MemberAvatar profile={member.profile} />
                <span className="truncate text-sm font-semibold">
                  {member.profile.displayName}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <span>{member.goalsAchievedToday}/4 today</span>
                <span className="text-muted">
                  {member.individualPct}% complete
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
