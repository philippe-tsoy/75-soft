"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AchievementToast } from "@/components/achievements";
import { Sheet } from "@/components/sheets/sheet";
import { Button, Card, Input, Label } from "@/components/ui";
import {
  DayApiError,
  requestDayApi,
  withOperationId,
} from "@/features/day-tracking/client";
import {
  amountDeltaTo,
  applyOptimisticAmount,
  applyOptimisticDiet,
  resolveAmountFill,
  withGoalState,
} from "@/features/day-tracking/optimistic";
import { invalidateDayTracking } from "@/features/day-tracking/invalidation";
import type {
  AchievementDTO,
  AmountInputMode,
  ContainerDTO,
  DayRollupDTO,
  GoalProgressDTO,
} from "@/lib/types";
import { normalizeWaterAmount } from "@/lib/validation";

import { AmountSlider } from "./amount-slider";
import { ContainerManager } from "./container-manager";
import { GoalControl } from "./goal-control";

export interface DayTrackerProps {
  initialDay: DayRollupDTO;
  initialContainers: ContainerDTO[];
  userId: string;
  today: string;
  amountInputMode: AmountInputMode;
}

/**
 * Slider granularity per goal. The right end of every track is the goal's
 * own target, so these only control how finely the thumb snaps.
 */
const SLIDER_STEPS: Record<AmountGoal, number> = {
  reading: 1,
  water: 50,
  workout: 1,
};

const FALLBACK_TARGETS: Record<AmountGoal, number> = {
  reading: 10,
  water: 2_000,
  workout: 45,
};

/** Unit each amount goal's ledger entries are logged in. */
const AMOUNT_UNITS: Record<AmountGoal, AmountUnit> = {
  reading: "pages",
  water: "ml",
  workout: "minutes",
};

type AmountGoal = "workout" | "water" | "reading";

/** The four independently-editable cards on the tracker. */
type GoalKey = AmountGoal | "diet";

interface DayMutationResponse {
  day: DayRollupDTO;
  newAchievements?: AchievementDTO[];
}

type AmountUnit = "minutes" | "ml" | "l" | "pages";

interface GoalErrorState {
  message: string;
  sessionExpired: boolean;
  /** Re-attempts the failed mutation with the same idempotency key. */
  retry: () => void;
}

function formatStatus(status: DayRollupDTO["status"]): string {
  return status.replace("_", " ");
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

  function submitCustomAmount(sign: 1 | -1) {
    const magnitude = Number(customAmount);
    if (!Number.isInteger(magnitude) || magnitude <= 0) {
      setValidationError("Enter a positive whole number.");
      return;
    }

    setValidationError(null);
    onAdd(magnitude * sign);
    setCustomAmount("");
  }

  return (
    <form
      className="flex min-w-[14rem] flex-1 gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submitCustomAmount(1);
      }}
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
      <Button
        disabled={pending}
        onClick={() => submitCustomAmount(-1)}
        type="button"
        variant="secondary"
      >
        − Remove
      </Button>
      <Button disabled={pending} type="submit">
        + Add
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

  function submitCustomAmount(sign: 1 | -1) {
    const magnitude = Number(customAmount);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      setValidationError("Enter a positive whole number.");
      return;
    }

    try {
      normalizeWaterAmount(magnitude, unit);
    } catch {
      setValidationError(
        unit === "l"
          ? "Use a positive amount that converts to whole milliliters."
          : "Enter a positive whole number.",
      );
      return;
    }

    setValidationError(null);
    onAdd(magnitude * sign, unit);
    setCustomAmount("");
  }

  return (
    <form
      className="flex min-w-[14rem] flex-1 flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submitCustomAmount(1);
      }}
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
      <Button
        disabled={pending}
        onClick={() => submitCustomAmount(-1)}
        type="button"
        variant="secondary"
      >
        − Remove
      </Button>
      <Button disabled={pending} type="submit">
        + Add
      </Button>
      {validationError ? (
        <p className="basis-full text-sm text-red-700" role="alert">
          {validationError}
        </p>
      ) : null}
    </form>
  );
}

function AmountStepper({
  amount,
  unitLabel,
  label,
  pending,
  onAdjust,
}: {
  amount: number;
  unitLabel: string;
  label: string;
  pending: boolean;
  onAdjust: (signedAmount: number) => void;
}) {
  return (
    <div className="border-border inline-flex items-center gap-1 rounded-xl border p-1">
      <Button
        aria-label={`Remove ${amount} ${unitLabel} from ${label}`}
        disabled={pending}
        onClick={() => onAdjust(-amount)}
        variant="secondary"
      >
        −
      </Button>
      <span className="min-w-[4.5rem] text-center text-sm font-semibold">
        {amount} {unitLabel}
      </span>
      <Button
        aria-label={`Add ${amount} ${unitLabel} to ${label}`}
        disabled={pending}
        onClick={() => onAdjust(amount)}
        variant="secondary"
      >
        +
      </Button>
    </div>
  );
}

function ContainerStepper({
  container,
  pending,
  onAddContainer,
  onRemoveContainer,
}: {
  container: ContainerDTO;
  pending: boolean;
  onAddContainer: () => void;
  onRemoveContainer: () => void;
}) {
  const isPendingCreate = container.id.startsWith("pending-");

  return (
    <div className="border-border inline-flex items-center gap-1 rounded-xl border p-1">
      <Button
        aria-label={`Remove ${container.label} (${container.volumeMl} ml) from Water`}
        disabled={pending || isPendingCreate}
        onClick={onRemoveContainer}
        variant="secondary"
      >
        −
      </Button>
      <span className="min-w-[6rem] text-center text-sm font-semibold">
        {container.label} · {container.volumeMl} ml
      </span>
      <Button
        aria-label={`Add ${container.label} (${container.volumeMl} ml) to Water`}
        disabled={pending || isPendingCreate}
        onClick={onAddContainer}
        variant="secondary"
      >
        +
      </Button>
    </div>
  );
}

function ProgressControl({
  title,
  progress,
  pending,
  onAdd,
  onToggleDone,
  toggleLocked,
  error,
  sessionExpired,
  onRetry,
  quickAmounts,
  unitLabel,
  inputLabel,
  inputPlaceholder,
}: {
  title: string;
  progress: GoalProgressDTO;
  pending: boolean;
  onAdd: (amount: number) => void;
  onToggleDone: () => void;
  toggleLocked: boolean;
  error?: string | null;
  sessionExpired?: boolean;
  onRetry?: () => void;
  quickAmounts: number[];
  unitLabel: string;
  inputLabel: string;
  inputPlaceholder: string;
}) {
  return (
    <GoalControl
      error={error}
      onRetry={onRetry}
      onToggleDone={onToggleDone}
      pending={pending}
      progress={progress}
      sessionExpired={sessionExpired}
      title={title}
      toggleLocked={toggleLocked}
    >
      {quickAmounts.map((amount) => (
        <AmountStepper
          amount={amount}
          key={amount}
          label={title}
          onAdjust={onAdd}
          pending={pending}
          unitLabel={unitLabel}
        />
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

function SliderControl({
  title,
  goal,
  progress,
  pending,
  unitLabel,
  onSetAmount,
  onToggleDone,
  toggleLocked,
  error,
  sessionExpired,
  onRetry,
}: {
  title: string;
  goal: AmountGoal;
  progress: GoalProgressDTO;
  pending: boolean;
  unitLabel: string;
  onSetAmount: (nextValue: number) => void;
  onToggleDone: () => void;
  toggleLocked: boolean;
  error?: string | null;
  sessionExpired?: boolean;
  onRetry?: () => void;
}) {
  return (
    <GoalControl
      error={error}
      onRetry={onRetry}
      onToggleDone={onToggleDone}
      pending={pending}
      progress={progress}
      sessionExpired={sessionExpired}
      title={title}
      toggleLocked={toggleLocked}
    >
      <AmountSlider
        disabled={pending}
        label={title}
        onCommit={onSetAmount}
        step={SLIDER_STEPS[goal]}
        target={progress.target ?? FALLBACK_TARGETS[goal]}
        unitLabel={unitLabel}
        value={progress.amount ?? 0}
      />
    </GoalControl>
  );
}

export function DayTracker({
  initialDay,
  initialContainers,
  userId,
  today,
  amountInputMode,
}: DayTrackerProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [day, setDay] = useState(initialDay);
  const [containers, setContainers] = useState(initialContainers);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [goalErrors, setGoalErrors] = useState<
    Partial<Record<GoalKey, GoalErrorState>>
  >({});
  const [containersOpen, setContainersOpen] = useState(false);
  const [achievementToast, setAchievementToast] =
    useState<AchievementDTO | null>(null);
  const [preFillAmount, setPreFillAmount] = useState<
    Partial<Record<AmountGoal, number>>
  >({});
  const useSliders = amountInputMode === "slider";

  function isPending(goal: GoalKey): boolean {
    return Boolean(pending[goal]);
  }

  function setGoalError(goal: GoalKey, state: GoalErrorState) {
    setGoalErrors((current) => ({ ...current, [goal]: state }));
  }

  function clearGoalError(goal: GoalKey) {
    setGoalErrors((current) => {
      if (!(goal in current)) {
        return current;
      }

      const next = { ...current };
      delete next[goal];
      return next;
    });
  }

  function refreshRelatedData() {
    invalidateDayTracking(queryClient, userId, day.localDate);
    router.refresh();
  }

  function toOptimisticAmount(
    goal: AmountGoal,
    amount: number,
    unit: AmountUnit,
  ): number {
    if (goal === "water" && (unit === "ml" || unit === "l")) {
      return normalizeWaterAmount(amount, unit);
    }

    return amount;
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
    if (isPending(goal)) {
      return;
    }
    if (!day.editable) {
      return;
    }

    const previousGoalProgress = day.goals[goal];
    const operation = withOperationId(retryOperationId);
    setDay((prevDay) =>
      applyOptimisticAmount(
        prevDay,
        goal,
        toOptimisticAmount(goal, amount, unit),
        today,
      ),
    );
    setGoalPending(goal, true);
    clearGoalError(goal);

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
      setDay((prevDay) =>
        withGoalState(prevDay, goal, result.day.goals[goal], today),
      );
      setAchievementToast(result.newAchievements?.[0] ?? null);
      refreshRelatedData();
    } catch (requestError) {
      setDay((prevDay) =>
        withGoalState(prevDay, goal, previousGoalProgress, today),
      );
      setGoalError(goal, {
        message: apiErrorMessage(requestError),
        sessionExpired:
          requestError instanceof DayApiError && requestError.status === 401,
        retry: () => void addAmount(goal, amount, unit, operation.operationId),
      });
    } finally {
      setGoalPending(goal, false);
    }
  }

  async function addContainer(
    container: ContainerDTO,
    retryOperationId?: string,
  ) {
    if (isPending("water")) {
      return;
    }
    if (!day.editable) {
      return;
    }

    const previousGoalProgress = day.goals.water;
    const operation = withOperationId(retryOperationId);
    setDay((prevDay) =>
      applyOptimisticAmount(prevDay, "water", container.volumeMl, today),
    );
    setGoalPending("water", true);
    clearGoalError("water");

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
      setDay((prevDay) =>
        withGoalState(prevDay, "water", result.day.goals.water, today),
      );
      setAchievementToast(result.newAchievements?.[0] ?? null);
      refreshRelatedData();
    } catch (requestError) {
      setDay((prevDay) =>
        withGoalState(prevDay, "water", previousGoalProgress, today),
      );
      setGoalError("water", {
        message: apiErrorMessage(requestError),
        sessionExpired:
          requestError instanceof DayApiError && requestError.status === 401,
        retry: () => void addContainer(container, operation.operationId),
      });
    } finally {
      setGoalPending("water", false);
    }
  }

  async function toggleDiet(retryOperationId?: string) {
    if (isPending("diet")) {
      return;
    }
    if (!day.editable) {
      return;
    }

    const previousGoalProgress = day.goals.diet;
    const operation = withOperationId(retryOperationId);
    setDay((prevDay) => applyOptimisticDiet(prevDay, today));
    setGoalPending("diet", true);
    clearGoalError("diet");

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
      setDay((prevDay) =>
        withGoalState(prevDay, "diet", result.day.goals.diet, today),
      );
      setAchievementToast(result.newAchievements?.[0] ?? null);
      refreshRelatedData();
    } catch (requestError) {
      setDay((prevDay) =>
        withGoalState(prevDay, "diet", previousGoalProgress, today),
      );
      setGoalError("diet", {
        message: apiErrorMessage(requestError),
        sessionExpired:
          requestError instanceof DayApiError && requestError.status === 401,
        retry: () => void toggleDiet(operation.operationId),
      });
    } finally {
      setGoalPending("diet", false);
    }
  }

  /**
   * The slider picks an absolute total; the ledger only accepts signed
   * deltas, so translate before hitting the same endpoint the steppers use.
   */
  function setAmountTo(goal: AmountGoal, nextValue: number, unit: AmountUnit) {
    const delta = amountDeltaTo(day.goals[goal].amount ?? 0, nextValue);
    if (delta === 0) {
      return;
    }

    void addAmount(goal, delta, unit);
  }

  /**
   * The checkmark on an amount goal is a fill/undo shortcut, not an
   * independent flag: checking it fills the amount to the target, and
   * checking it again restores whatever amount was logged right before
   * that fill. Reaching the target by dragging the slider itself still
   * locks the checkmark (see isAmountToggleLocked) since there is no
   * "previous amount" to restore to.
   */
  function toggleAmountFill(goal: AmountGoal) {
    if (isPending(goal)) {
      return;
    }
    if (!day.editable) {
      return;
    }

    const progress = day.goals[goal];
    const target = progress.target ?? FALLBACK_TARGETS[goal];
    const amount = progress.amount ?? 0;
    const unit = AMOUNT_UNITS[goal];
    const resolution = resolveAmountFill(amount, target, preFillAmount[goal]);

    if (resolution.action === "locked") {
      return;
    }

    setPreFillAmount((current) => {
      const next = { ...current };
      if (resolution.action === "fill") {
        next[goal] = amount;
      } else {
        delete next[goal];
      }
      return next;
    });
    setAmountTo(goal, resolution.nextValue, unit);
  }

  function isAmountToggleLocked(goal: AmountGoal): boolean {
    const progress = day.goals[goal];
    if (progress.amount === undefined || progress.target === undefined) {
      return false;
    }

    return (
      progress.amount >= progress.target && preFillAmount[goal] === undefined
    );
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
      </Card>

      {useSliders ? (
        <SliderControl
          error={goalErrors.workout?.message}
          goal="workout"
          onRetry={goalErrors.workout?.retry}
          onSetAmount={(next) => setAmountTo("workout", next, "minutes")}
          onToggleDone={() => toggleAmountFill("workout")}
          pending={isPending("workout") || !day.editable}
          progress={day.goals.workout}
          sessionExpired={goalErrors.workout?.sessionExpired}
          title="Workout"
          toggleLocked={isAmountToggleLocked("workout")}
          unitLabel="min"
        />
      ) : (
        <ProgressControl
          error={goalErrors.workout?.message}
          inputLabel="Workout minutes to add or remove"
          inputPlaceholder="Minutes"
          onAdd={(amount) => void addAmount("workout", amount, "minutes")}
          onRetry={goalErrors.workout?.retry}
          onToggleDone={() => toggleAmountFill("workout")}
          pending={isPending("workout") || !day.editable}
          progress={day.goals.workout}
          quickAmounts={[15, 30, 45]}
          sessionExpired={goalErrors.workout?.sessionExpired}
          title="Workout"
          toggleLocked={isAmountToggleLocked("workout")}
          unitLabel="min"
        />
      )}

      {useSliders ? (
        <SliderControl
          error={goalErrors.water?.message}
          goal="water"
          onRetry={goalErrors.water?.retry}
          onSetAmount={(next) => setAmountTo("water", next, "ml")}
          onToggleDone={() => toggleAmountFill("water")}
          pending={isPending("water") || !day.editable}
          progress={day.goals.water}
          sessionExpired={goalErrors.water?.sessionExpired}
          title="Water"
          toggleLocked={isAmountToggleLocked("water")}
          unitLabel="ml"
        />
      ) : (
        <GoalControl
          error={goalErrors.water?.message}
          onRetry={goalErrors.water?.retry}
          onToggleDone={() => toggleAmountFill("water")}
          pending={isPending("water") || !day.editable}
          progress={day.goals.water}
          sessionExpired={goalErrors.water?.sessionExpired}
          title="Water"
          toggleLocked={isAmountToggleLocked("water")}
          titleAction={
            <Button
              aria-label="Manage water containers"
              className="min-h-0 px-2 py-1 text-xs"
              disabled={isPending("water")}
              onClick={() => setContainersOpen(true)}
              variant="ghost"
            >
              Containers
            </Button>
          }
        >
          <AmountStepper
            amount={250}
            label="Water"
            onAdjust={(amount) => void addAmount("water", amount, "ml")}
            pending={isPending("water") || !day.editable}
            unitLabel="ml"
          />
          {containers.map((container) => (
            <ContainerStepper
              container={container}
              key={container.id}
              onAddContainer={() => void addContainer(container)}
              onRemoveContainer={() =>
                void addAmount("water", -container.volumeMl, "ml")
              }
              pending={isPending("water") || !day.editable}
            />
          ))}
          <CustomWaterAmountForm
            id="water-custom-amount"
            onAdd={(amount, unit) => void addAmount("water", amount, unit)}
            pending={isPending("water") || !day.editable}
          />
        </GoalControl>
      )}

      {useSliders ? (
        <SliderControl
          error={goalErrors.reading?.message}
          goal="reading"
          onRetry={goalErrors.reading?.retry}
          onSetAmount={(next) => setAmountTo("reading", next, "pages")}
          onToggleDone={() => toggleAmountFill("reading")}
          pending={isPending("reading") || !day.editable}
          progress={day.goals.reading}
          sessionExpired={goalErrors.reading?.sessionExpired}
          title="Reading"
          toggleLocked={isAmountToggleLocked("reading")}
          unitLabel="pages"
        />
      ) : (
        <ProgressControl
          error={goalErrors.reading?.message}
          inputLabel="Reading pages to add or remove"
          inputPlaceholder="Pages"
          onAdd={(amount) => void addAmount("reading", amount, "pages")}
          onRetry={goalErrors.reading?.retry}
          onToggleDone={() => toggleAmountFill("reading")}
          pending={isPending("reading") || !day.editable}
          progress={day.goals.reading}
          quickAmounts={[5, 10]}
          sessionExpired={goalErrors.reading?.sessionExpired}
          title="Reading"
          toggleLocked={isAmountToggleLocked("reading")}
          unitLabel="pages"
        />
      )}

      <GoalControl
        error={goalErrors.diet?.message}
        onRetry={goalErrors.diet?.retry}
        onToggleDone={() => void toggleDiet()}
        pending={isPending("diet") || !day.editable}
        progress={day.goals.diet}
        sessionExpired={goalErrors.diet?.sessionExpired}
        title="Ate well & drank only socially"
      />

      <Sheet
        onClose={() => setContainersOpen(false)}
        open={containersOpen}
        title="Water containers"
      >
        <p className="text-muted mb-4 text-sm">
          Manage your saved containers here. Each one shows up as its own − / +
          stepper on the Water card.
        </p>
        <ContainerManager
          containers={containers}
          onContainersChange={setContainers}
        />
      </Sheet>

      <p className="text-muted px-1 text-xs">
        {useSliders
          ? "Drag a slider to set the total logged for that challenge; releasing it saves, and totals never drop below zero."
          : "Use − and + to log or correct workout, water, and reading amounts; corrections never drop a total below zero."}{" "}
        The checkmark on Workout, Water, and Reading fills the amount to the
        target; tapping it again restores whatever amount was logged before.
        Reaching the target by dragging the slider itself locks the checkmark
        until you move the amount back down. Switch between sliders and buttons
        on the Me screen; every action can be safely retried.
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
