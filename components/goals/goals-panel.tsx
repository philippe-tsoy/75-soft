"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { archiveGoal, fetchGoalTemplates, fetchGoals } from "@/components/goals/api";
import { GoalForm } from "@/components/goals/goal-form";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState, Toast } from "@/components/feedback";
import { queryKeys } from "@/lib/query-keys";
import type { GoalDTO } from "@/lib/types";

interface GoalsPanelProps {
  userId?: string;
  showArchived?: boolean;
  title?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not load your goals. Try again.";
}

export function GoalsPanel({
  userId = "me",
  showArchived = false,
  title = "Your goals",
}: GoalsPanelProps) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.goals(userId);
  const [editingGoal, setEditingGoal] = useState<GoalDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const goalsQuery = useQuery({ queryKey, queryFn: fetchGoals });
  const templatesQuery = useQuery({
    queryKey: queryKeys.goalTemplates(),
    queryFn: fetchGoalTemplates,
  });

  const updateCache = (savedGoal: GoalDTO) => {
    queryClient.setQueryData<GoalDTO[]>(queryKey, (current) => {
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
    mutationFn: archiveGoal,
    onSuccess: (goal) => {
      setArchiveError(null);
      updateCache(goal);
    },
    onError: (error: unknown) => setArchiveError(errorMessage(error)),
  });

  function openAddForm() {
    setEditingGoal(null);
    setFormOpen(true);
  }

  function openEditForm(goal: GoalDTO) {
    setEditingGoal(goal);
    setFormOpen(true);
  }

  // Two sequential confirmations: removing a goal is effectively permanent
  // (archiving can't be undone from this UI), so it gets a stronger gate
  // than the app's other destructive actions.
  function handleArchive(goal: GoalDTO) {
    if (!window.confirm(`Remove "${goal.name}"?`)) {
      return;
    }

    if (
      !window.confirm(
        "This can't be undone from here. Past logs and its contribution to your history stay intact, but you won't be able to track it again without adding it back. Remove permanently?",
      )
    ) {
      return;
    }

    archiveMutation.mutate(goal.id);
  }

  if (goalsQuery.isPending) {
    return <LoadingState label="Loading your goals…" />;
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
      <Card aria-busy={archiveMutation.isPending}>
        <CardHeader className="flex items-start justify-between gap-4 sm:flex-row">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="text-muted mt-1 text-sm">
              A private goal still counts toward your percentage and rank —
              only its name is hidden from everyone else.
            </p>
          </div>
          <Button onClick={openAddForm} variant="secondary">
            Add goal
          </Button>
        </CardHeader>

        {goals.length === 0 ? (
          <EmptyState
            message={showArchived ? "No goals yet." : "No active goals yet."}
          />
        ) : (
          <ul className="space-y-3">
            {goals.map((goal) => (
              <li className="border-border rounded-2xl border p-4" key={goal.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {goal.name}
                      {goal.isPrivate ? (
                        <span className="text-muted ml-2 text-xs font-normal">
                          Private
                        </span>
                      ) : null}
                    </h3>
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
                    {goal.active ? "Active" : "Removed"}
                  </span>
                </div>

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
                      Remove
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <GoalForm
        goal={editingGoal}
        key={`${formOpen ? "open" : "closed"}:${editingGoal?.id ?? "new"}`}
        onClose={() => setFormOpen(false)}
        onSaved={updateCache}
        open={formOpen}
        templates={templatesQuery.data ?? []}
      />

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
