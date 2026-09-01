"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  archiveOptionalGoal,
  fetchOptionalGoals,
  logOptionalGoal,
} from "@/components/optional-goals/api";
import { OptionalGoalForm } from "@/components/optional-goals/optional-goal-form";
import { OptionalGoalLogControl } from "@/components/optional-goals/optional-goal-log-control";
import { useOptionalGoalStreakToast } from "@/components/optional-goals/use-optional-goal-streak-toast";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Toast,
} from "@/components/feedback";
import type {
  OptionalGoalLogInput,
  OptionalGoalLogResultDTO,
} from "@/features/optional-goals/types";
import { optionalGoalWithMode } from "@/features/optional-goals/service";
import { queryKeys } from "@/lib/query-keys";
import type { OptionalGoalDTO } from "@/lib/types";

interface OptionalGoalsPanelProps {
  userId?: string;
  localDate?: string;
  showArchived?: boolean;
  title?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not load optional goals. Try again.";
}

export function OptionalGoalsPanel({
  userId = "me",
  localDate,
  showArchived = false,
  title = "Optional goals",
}: OptionalGoalsPanelProps) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.optionalGoals(userId);
  const [editingGoal, setEditingGoal] = useState<OptionalGoalDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { streakToast, showStreakToast, dismissStreakToast } =
    useOptionalGoalStreakToast();
  const goalsQuery = useQuery({
    queryKey,
    queryFn: fetchOptionalGoals,
  });

  const updateCache = (savedGoal: OptionalGoalDTO) => {
    queryClient.setQueryData<OptionalGoalDTO[]>(queryKey, (current) => {
      if (!current) {
        return [savedGoal];
      }

      const exists = current.some((goal) => goal.id === savedGoal.id);
      return exists
        ? current.map((goal) => (goal.id === savedGoal.id ? savedGoal : goal))
        : [savedGoal, ...current];
    });
  };

  const [archiveError, setArchiveError] = useState<string | null>(null);

  const archiveMutation = useMutation({
    mutationFn: archiveOptionalGoal,
    onSuccess: (goal) => {
      setArchiveError(null);
      updateCache(goal);
    },
    onError: (error: unknown) => setArchiveError(errorMessage(error)),
  });

  const logMutation = useMutation<
    OptionalGoalLogResultDTO,
    Error,
    { goalId: string; input: OptionalGoalLogInput }
  >({
    mutationFn: ({ goalId, input }) => logOptionalGoal(goalId, input),
    onSuccess: (result) => {
      if (result.streakToast) {
        showStreakToast(result.streakToast);
      }
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  function openAddForm() {
    setEditingGoal(null);
    setFormOpen(true);
  }

  function openEditForm(goal: OptionalGoalDTO) {
    setEditingGoal(goal);
    setFormOpen(true);
  }

  function handleArchive(goal: OptionalGoalDTO) {
    if (
      !window.confirm(
        `Archive "${goal.name}"? Existing logs will remain visible in history.`,
      )
    ) {
      return;
    }

    archiveMutation.mutate(goal.id);
  }

  if (goalsQuery.isPending) {
    return <LoadingState label="Loading optional goals…" />;
  }

  if (goalsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(goalsQuery.error)}
        onRetry={() => void goalsQuery.refetch()}
      />
    );
  }

  const goals = (goalsQuery.data ?? []).filter(
    (goal) => showArchived || goal.active,
  );

  return (
    <>
      <Card aria-busy={archiveMutation.isPending || logMutation.isPending}>
        <CardHeader className="flex items-start justify-between gap-4 sm:flex-row">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="text-muted mt-1 text-sm">
              Personal progress stays quiet and never changes required scoring.
            </p>
          </div>
          <Button onClick={openAddForm} variant="secondary">
            Add goal
          </Button>
        </CardHeader>

        {goals.length === 0 ? (
          <EmptyState
            message={
              showArchived
                ? "No optional goals yet."
                : "No active optional goals yet."
            }
          />
        ) : (
          <ul className="space-y-3">
            {goals.map((goal) => {
              const goalWithMode = optionalGoalWithMode(goal);
              return (
                <li
                  className="border-border rounded-2xl border p-4"
                  key={goal.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{goal.name}</h3>
                      <p className="text-muted mt-1 text-sm">
                        {goal.targetValue === null
                          ? "Checkbox goal"
                          : `Target: ${goal.targetValue} ${goal.unit}`}
                      </p>
                    </div>
                    <span
                      className={
                        goal.active
                          ? "text-primary text-xs font-semibold"
                          : "text-muted text-xs font-semibold"
                      }
                    >
                      {goal.active ? "Active" : "Archived"}
                    </span>
                  </div>

                  {goal.active && localDate ? (
                    <OptionalGoalLogControl
                      goal={goalWithMode}
                      localDate={localDate}
                      onLog={(input) =>
                        logMutation.mutateAsync({
                          goalId: goal.id,
                          input,
                        })
                      }
                    />
                  ) : null}

                  <div className="mt-4 flex justify-end gap-2">
                    <Button onClick={() => openEditForm(goal)} variant="ghost">
                      Edit
                    </Button>
                    {goal.active ? (
                      <Button
                        disabled={archiveMutation.isPending}
                        onClick={() => handleArchive(goal)}
                        variant="danger"
                      >
                        Archive
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <OptionalGoalForm
        goal={editingGoal}
        key={`${formOpen ? "open" : "closed"}:${editingGoal?.id ?? "new"}`}
        onClose={() => setFormOpen(false)}
        onSaved={updateCache}
        open={formOpen}
      />

      {streakToast ? (
        <Toast
          message={streakToast.message}
          onDismiss={dismissStreakToast}
          tone="success"
        />
      ) : null}

      {archiveError ? (
        <Toast
          message={archiveError}
          onDismiss={() => setArchiveError(null)}
          tone="error"
        />
      ) : null}
    </>
  );
}
