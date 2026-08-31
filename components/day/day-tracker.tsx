"use client";

import { useState, type FormEvent } from "react";

import { AchievementToast } from "@/components/achievements";
import { Button, Card, Input, Label } from "@/components/ui";
import {
  DayApiError,
  requestDayApi,
  withOperationId,
} from "@/features/day-tracking/client";
import {
  applyOptimisticAmount,
  applyOptimisticDiet,
} from "@/features/day-tracking/optimistic";
import type {
  AchievementDTO,
  ContainerDTO,
  DayRollupDTO,
  GoalProgressDTO,
} from "@/lib/types";

import { ContainerManager } from "./container-manager";
import { GoalControl } from "./goal-control";

export interface DayTrackerProps {
  initialDay: DayRollupDTO;
  initialContainers: ContainerDTO[];
  userId: string;
  today: string;
}

type AmountGoal = "workout" | "water" | "reading";

interface DayMutationResponse {
  day: DayRollupDTO;
  newAchievements?: AchievementDTO[];
}

function formatStatus(status: DayRollupDTO["status"]): string {
  return status.replace("_", " ");
}

function apiErrorMessage(error: unknown): string {
  return error instanceof DayApiError
    ? error.message
    : "Your change could not be saved. Try again.";
}

function CustomAmountForm({
  id,
  pending,
  onAdd,
  inputLabel,
  inputPlaceholder,
}: {
  id: string;
  pending: boolean;
  onAdd: (amount: number) => void;
  inputLabel: string;
  inputPlaceholder: string;
}) {
  const [customAmount, setCustomAmount] = useState("");

  function submitCustomAmount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(customAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return;
    }

    onAdd(amount);
    setCustomAmount("");
  }

  return (
    <form
      className="flex min-w-[14rem] flex-1 gap-2"
      onSubmit={submitCustomAmount}
    >
      <Label className="sr-only" htmlFor={id}>
        {inputLabel}
      </Label>
      <Input
        aria-label={inputLabel}
        disabled={pending}
        id={id}
        inputMode="numeric"
        min={1}
        onChange={(event) => setCustomAmount(event.target.value)}
        placeholder={inputPlaceholder}
        type="number"
        value={customAmount}
      />
      <Button disabled={pending} type="submit">
        Add
      </Button>
    </form>
  );
}

function ProgressControl({
  title,
  progress,
  pending,
  onAdd,
  quickAmounts,
  inputLabel,
  inputPlaceholder,
}: {
  title: string;
  progress: GoalProgressDTO;
  pending: boolean;
  onAdd: (amount: number) => void;
  quickAmounts: number[];
  inputLabel: string;
  inputPlaceholder: string;
}) {
  return (
    <GoalControl pending={pending} progress={progress} title={title}>
      {quickAmounts.map((amount) => (
        <Button
          disabled={pending}
          key={amount}
          onClick={() => onAdd(amount)}
          variant="secondary"
        >
          +{amount}
        </Button>
      ))}
      <CustomAmountForm
        id={`${title}-custom-amount`}
        inputLabel={inputLabel}
        inputPlaceholder={inputPlaceholder}
        onAdd={onAdd}
        pending={pending}
      />
    </GoalControl>
  );
}

export function DayTracker({
  initialDay,
  initialContainers,
  userId,
  today,
}: DayTrackerProps) {
  const [day, setDay] = useState(initialDay);
  const [containers, setContainers] = useState(initialContainers);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [achievementToast, setAchievementToast] =
    useState<AchievementDTO | null>(null);
  const dayMutationPending = Object.values(pending).some(Boolean);

  function setGoalPending(goal: string, value: boolean) {
    setPending((current) => ({ ...current, [goal]: value }));
  }

  async function addAmount(
    goal: AmountGoal,
    amount: number,
    unit: "minutes" | "ml" | "pages",
  ) {
    if (dayMutationPending) {
      return;
    }
    if (!day.editable) {
      setError("This day is view-only.");
      return;
    }

    const previous = day;
    const operation = withOperationId();
    setDay(applyOptimisticAmount(day, goal, amount, today));
    setGoalPending(goal, true);
    setError(null);

    try {
      const result = await requestDayApi<DayMutationResponse>(
        `/api/day/${day.localDate}/entries`,
        {
          method: "POST",
          headers: operation.headers,
          body: JSON.stringify({
            goal,
            amount,
            unit,
            clientOperationId: operation.operationId,
          }),
        },
      );
      setDay(result.day);
      setAchievementToast(result.newAchievements?.[0] ?? null);
    } catch (requestError) {
      setDay(previous);
      setError(apiErrorMessage(requestError));
    } finally {
      setGoalPending(goal, false);
    }
  }

  async function addContainer(container: ContainerDTO) {
    if (dayMutationPending) {
      return;
    }
    if (!day.editable) {
      setError("This day is view-only.");
      return;
    }

    const previous = day;
    const operation = withOperationId();
    setDay(applyOptimisticAmount(day, "water", container.volumeMl, today));
    setGoalPending("water", true);
    setError(null);

    try {
      const result = await requestDayApi<DayMutationResponse>(
        `/api/day/${day.localDate}/entries`,
        {
          method: "POST",
          headers: operation.headers,
          body: JSON.stringify({
            goal: "water",
            containerId: container.id,
            clientOperationId: operation.operationId,
          }),
        },
      );
      setDay(result.day);
      setAchievementToast(result.newAchievements?.[0] ?? null);
    } catch (requestError) {
      setDay(previous);
      setError(apiErrorMessage(requestError));
    } finally {
      setGoalPending("water", false);
    }
  }

  async function toggleDiet() {
    if (dayMutationPending) {
      return;
    }
    if (!day.editable) {
      setError("This day is view-only.");
      return;
    }

    const previous = day;
    const operation = withOperationId();
    setDay(applyOptimisticDiet(day, today));
    setGoalPending("diet", true);
    setError(null);

    try {
      const result = await requestDayApi<DayMutationResponse>(
        `/api/day/${day.localDate}/diet/toggle`,
        {
          method: "POST",
          headers: operation.headers,
          body: JSON.stringify({
            clientOperationId: operation.operationId,
          }),
        },
      );
      setDay(result.day);
      setAchievementToast(result.newAchievements?.[0] ?? null);
    } catch (requestError) {
      setDay(previous);
      setError(apiErrorMessage(requestError));
    } finally {
      setGoalPending("diet", false);
    }
  }

  return (
    <div className="space-y-4 py-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide">
              Day {day.dayNumber}
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              {day.localDate === today
                ? "Today's challenges"
                : "Yesterday's challenges"}
            </h1>
            <p className="text-muted mt-2 text-sm">
              {day.localDate} · {formatStatus(day.status)}
            </p>
          </div>
          <p
            aria-label={`${day.metCount} of 4 challenges met`}
            className="text-sm font-semibold"
          >
            {day.metCount}/4 met
          </p>
        </div>
        {!day.editable ? (
          <p className="text-muted mt-4 rounded-xl bg-slate-100 p-3 text-sm">
            This day is view-only. Only today and yesterday can be changed.
          </p>
        ) : null}
        {day.invalidated ? (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            This day was invalidated by an administrator.
          </p>
        ) : null}
        {error ? (
          <p
            aria-live="assertive"
            className="mt-4 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </Card>

      <ProgressControl
        inputLabel="Workout minutes to add"
        inputPlaceholder="Minutes"
        onAdd={(amount) => void addAmount("workout", amount, "minutes")}
        pending={dayMutationPending || !day.editable}
        progress={day.goals.workout}
        quickAmounts={[15, 30]}
        title="Workout"
      />

      <GoalControl
        pending={dayMutationPending || !day.editable}
        progress={day.goals.water}
        title="Water"
      >
        {containers.map((container) => (
          <Button
            disabled={
              dayMutationPending ||
              !day.editable ||
              container.id.startsWith("pending-")
            }
            key={container.id}
            onClick={() => void addContainer(container)}
            variant="secondary"
          >
            +{container.volumeMl} ml {container.label}
          </Button>
        ))}
        <Button
          disabled={dayMutationPending || !day.editable}
          onClick={() => void addAmount("water", 250, "ml")}
          variant="secondary"
        >
          +250 ml
        </Button>
        <CustomAmountForm
          id="water-custom-amount"
          inputLabel="Water milliliters to add"
          inputPlaceholder="Milliliters"
          onAdd={(amount) => void addAmount("water", amount, "ml")}
          pending={dayMutationPending || !day.editable}
        />
      </GoalControl>

      <ProgressControl
        inputLabel="Reading pages to add"
        inputPlaceholder="Pages"
        onAdd={(amount) => void addAmount("reading", amount, "pages")}
        pending={dayMutationPending || !day.editable}
        progress={day.goals.reading}
        quickAmounts={[5, 10]}
        title="Reading"
      />

      <GoalControl
        pending={dayMutationPending || !day.editable}
        progress={day.goals.diet}
        title="Ate well & drank only socially"
      >
        <Button
          aria-pressed={day.goals.diet.met}
          disabled={dayMutationPending || !day.editable}
          onClick={() => void toggleDiet()}
        >
          {day.goals.diet.met ? "Undo diet" : "Mark diet met"}
        </Button>
      </GoalControl>

      <ContainerManager
        containers={containers}
        onContainersChange={setContainers}
        onError={setError}
      />

      <p className="text-muted px-1 text-xs">
        Workout, water, and reading add to the day. Diet uses the latest toggle
        state; every action can be safely retried.
      </p>
      <AchievementToast
        onDismiss={() => setAchievementToast(null)}
        toast={achievementToast}
      />
      <span className="sr-only" id={`tracker-user-${userId}`}>
        Tracker for current member
      </span>
    </div>
  );
}
