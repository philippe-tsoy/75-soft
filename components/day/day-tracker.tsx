"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AchievementToast } from "@/components/achievements";
import { Sheet } from "@/components/sheets/sheet";
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
import { queryKeys } from "@/lib/query-keys";

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

type AmountUnit = "minutes" | "ml" | "l" | "pages";

type RetryAction =
  | {
      kind: "amount";
      goal: AmountGoal;
      amount: number;
      unit: AmountUnit;
      operationId: string;
    }
  | {
      kind: "container";
      container: ContainerDTO;
      operationId: string;
    }
  | {
      kind: "diet";
      operationId: string;
    };

function formatStatus(status: DayRollupDTO["status"]): string {
  return status.replace("_", " ");
}

function formatWaterVolume(volumeMl: number): string {
  const liters = volumeMl / 1_000;
  return Number.isInteger(liters)
    ? `${liters} L`
    : `${volumeMl.toLocaleString()} ml`;
}

function apiErrorMessage(error: unknown): string {
  if (error instanceof DayApiError && error.status === 401) {
    return "Your session expired. Sign in again to save changes.";
  }

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
  const [validationError, setValidationError] = useState<string | null>(null);

  function submitCustomAmount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(customAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setValidationError("Enter a positive whole number.");
      return;
    }

    setValidationError(null);
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
        onChange={(event) => {
          setCustomAmount(event.target.value);
          setValidationError(null);
        }}
        placeholder={inputPlaceholder}
        type="number"
        value={customAmount}
      />
      <Button disabled={pending} type="submit">
        Add
      </Button>
      {validationError ? (
        <p className="basis-full text-sm text-red-700" role="alert">
          {validationError}
        </p>
      ) : null}
    </form>
  );
}

function CustomWaterAmountForm({
  id,
  pending,
  onAdd,
}: {
  id: string;
  pending: boolean;
  onAdd: (amount: number, unit: "ml" | "l") => void;
}) {
  const [customAmount, setCustomAmount] = useState("");
  const [unit, setUnit] = useState<"ml" | "l">("ml");
  const [validationError, setValidationError] = useState<string | null>(null);

  function submitCustomAmount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(customAmount);
    const normalized = unit === "l" ? amount * 1_000 : amount;
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(normalized)
    ) {
      setValidationError(
        unit === "l"
          ? "Use a positive amount that converts to whole milliliters."
          : "Enter a positive whole number.",
      );
      return;
    }

    setValidationError(null);
    onAdd(amount, unit);
    setCustomAmount("");
  }

  return (
    <form
      className="flex min-w-[14rem] flex-1 flex-wrap gap-2"
      onSubmit={submitCustomAmount}
    >
      <Label className="sr-only" htmlFor={id}>
        Custom water amount
      </Label>
      <Input
        aria-invalid={validationError ? true : undefined}
        aria-label="Custom water amount"
        disabled={pending}
        id={id}
        inputMode={unit === "l" ? "decimal" : "numeric"}
        min={unit === "l" ? "0.01" : "1"}
        onChange={(event) => {
          setCustomAmount(event.target.value);
          setValidationError(null);
        }}
        placeholder={unit === "l" ? "Liters" : "Milliliters"}
        step={unit === "l" ? "any" : "1"}
        type="number"
        value={customAmount}
      />
      <select
        aria-label="Custom water unit"
        className="border-border bg-card text-foreground focus-visible:ring-primary min-h-11 rounded-xl border px-3 text-sm outline-none focus-visible:ring-2"
        disabled={pending}
        onChange={(event) => {
          setUnit(event.target.value as "ml" | "l");
          setValidationError(null);
        }}
        value={unit}
      >
        <option value="ml">ml</option>
        <option value="l">L</option>
      </select>
      <Button disabled={pending} type="submit">
        Add
      </Button>
      {validationError ? (
        <p className="basis-full text-sm text-red-700" role="alert">
          {validationError}
        </p>
      ) : null}
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
  const queryClient = useQueryClient();
  const router = useRouter();
  const [day, setDay] = useState(initialDay);
  const [containers, setContainers] = useState(initialContainers);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);
  const [containersOpen, setContainersOpen] = useState(false);
  const [achievementToast, setAchievementToast] =
    useState<AchievementDTO | null>(null);
  const dayMutationPending = Object.values(pending).some(Boolean);

  function refreshRelatedData() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.day(userId, day.localDate),
    });
    void queryClient.invalidateQueries({ queryKey: ["group-strip"] });
    void queryClient.invalidateQueries({ queryKey: ["board"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.person(userId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.achievements(userId),
    });
    router.refresh();
  }

  function setGoalPending(goal: string, value: boolean) {
    setPending((current) => ({ ...current, [goal]: value }));
  }

  async function addAmount(
    goal: AmountGoal,
    amount: number,
    unit: AmountUnit,
    retryOperationId?: string,
  ) {
    if (dayMutationPending) {
      return;
    }
    if (!day.editable) {
      setError("This day is view-only.");
      return;
    }

    const previous = day;
    const operation = withOperationId(retryOperationId);
    const action: RetryAction = {
      amount,
      goal,
      kind: "amount",
      operationId: operation.operationId,
      unit,
    };
    setDay(applyOptimisticAmount(day, goal, amount, today));
    setGoalPending(goal, true);
    setError(null);
    setSessionExpired(false);
    setRetryAction(null);

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
      refreshRelatedData();
    } catch (requestError) {
      setDay(previous);
      setError(apiErrorMessage(requestError));
      setSessionExpired(
        requestError instanceof DayApiError && requestError.status === 401,
      );
      setRetryAction(action);
    } finally {
      setGoalPending(goal, false);
    }
  }

  async function addContainer(
    container: ContainerDTO,
    retryOperationId?: string,
  ) {
    if (dayMutationPending) {
      return;
    }
    if (!day.editable) {
      setError("This day is view-only.");
      return;
    }

    const previous = day;
    const operation = withOperationId(retryOperationId);
    const action: RetryAction = {
      container,
      kind: "container",
      operationId: operation.operationId,
    };
    setDay(applyOptimisticAmount(day, "water", container.volumeMl, today));
    setGoalPending("water", true);
    setError(null);
    setSessionExpired(false);
    setRetryAction(null);

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
      refreshRelatedData();
    } catch (requestError) {
      setDay(previous);
      setError(apiErrorMessage(requestError));
      setSessionExpired(
        requestError instanceof DayApiError && requestError.status === 401,
      );
      setRetryAction(action);
    } finally {
      setGoalPending("water", false);
    }
  }

  async function toggleDiet(retryOperationId?: string) {
    if (dayMutationPending) {
      return;
    }
    if (!day.editable) {
      setError("This day is view-only.");
      return;
    }

    const previous = day;
    const operation = withOperationId(retryOperationId);
    const action: RetryAction = {
      kind: "diet",
      operationId: operation.operationId,
    };
    setDay(applyOptimisticDiet(day, today));
    setGoalPending("diet", true);
    setError(null);
    setSessionExpired(false);
    setRetryAction(null);

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
      refreshRelatedData();
    } catch (requestError) {
      setDay(previous);
      setError(apiErrorMessage(requestError));
      setSessionExpired(
        requestError instanceof DayApiError && requestError.status === 401,
      );
      setRetryAction(action);
    } finally {
      setGoalPending("diet", false);
    }
  }

  function retryFailedAction() {
    if (!retryAction) {
      return;
    }

    if (retryAction.kind === "amount") {
      void addAmount(
        retryAction.goal,
        retryAction.amount,
        retryAction.unit,
        retryAction.operationId,
      );
      return;
    }

    if (retryAction.kind === "container") {
      void addContainer(retryAction.container, retryAction.operationId);
      return;
    }

    void toggleDiet(retryAction.operationId);
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
          <div
            aria-live="assertive"
            className="mt-4 flex flex-wrap items-center gap-3 text-sm text-red-700"
            role="alert"
          >
            <p>{error}</p>
            {retryAction ? (
              <Button
                disabled={dayMutationPending}
                onClick={retryFailedAction}
                variant="secondary"
              >
                Retry
              </Button>
            ) : null}
            {sessionExpired ? (
              <Link
                className="font-semibold underline underline-offset-2"
                href="/login"
              >
                Sign in again
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>

      <ProgressControl
        inputLabel="Workout minutes to add"
        inputPlaceholder="Minutes"
        onAdd={(amount) => void addAmount("workout", amount, "minutes")}
        pending={dayMutationPending || !day.editable}
        progress={day.goals.workout}
        quickAmounts={[15, 30, 45]}
        title="Workout"
      />

      <GoalControl
        pending={dayMutationPending || !day.editable}
        progress={day.goals.water}
        title="Water"
      >
        <Button
          disabled={dayMutationPending}
          onClick={() => setContainersOpen(true)}
          variant="secondary"
        >
          Add water container
        </Button>
        <Button
          disabled={dayMutationPending || !day.editable}
          onClick={() => void addAmount("water", 250, "ml")}
          variant="secondary"
        >
          +250 ml
        </Button>
        <CustomWaterAmountForm
          id="water-custom-amount"
          onAdd={(amount, unit) => void addAmount("water", amount, unit)}
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

      <Sheet
        onClose={() => setContainersOpen(false)}
        open={containersOpen}
        title="Water containers"
      >
        <div className="space-y-4">
          <section aria-labelledby="water-container-picker-title">
            <h3
              className="text-foreground mb-2 text-sm font-semibold"
              id="water-container-picker-title"
            >
              Add a container
            </h3>
            {containers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {containers.map((container) => (
                  <Button
                    disabled={
                      dayMutationPending ||
                      !day.editable ||
                      container.id.startsWith("pending-")
                    }
                    key={container.id}
                    onClick={() => {
                      setContainersOpen(false);
                      void addContainer(container);
                    }}
                    variant="secondary"
                  >
                    +{formatWaterVolume(container.volumeMl)} {container.label}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-muted rounded-xl border border-dashed p-3 text-sm">
                No saved containers yet. Add one below.
              </p>
            )}
          </section>
          <ContainerManager
            containers={containers}
            onContainersChange={setContainers}
            onError={setError}
          />
        </div>
      </Sheet>

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
