"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { AchievementToast } from "@/components/achievements";
import { createGoal, fetchGoalTemplates, GoalForm } from "@/components/goals";
import { Sheet } from "@/components/sheets/sheet";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/components/ui";
import {
  DayApiError,
  requestDayApi,
  withOperationId,
} from "@/features/day-tracking/client";
import {
  amountDeltaTo,
  applyOptimisticAmount,
  applyOptimisticGoalDone,
  resolveAmountFill,
  withGoalState,
} from "@/features/day-tracking/optimistic";
import { invalidateDayTracking } from "@/features/day-tracking/invalidation";
import { queryKeys } from "@/lib/query-keys";
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
import {
  directionForSign,
  nextSwipeDate,
  resolveSwipeDirection,
} from "./swipe";

export interface DayTrackerProps {
  initialDay: DayRollupDTO;
  initialContainers: ContainerDTO[];
  userId: string;
  today: string;
  amountInputMode: AmountInputMode;
  /** False only when the member has never added a goal at all. */
  hasAnyGoals: boolean;
  /** The earliest date this member can swipe back to. */
  firstViewableDate: string;
}

interface DayMutationResponse {
  day: DayRollupDTO;
  newAchievements?: AchievementDTO[];
}

type AmountUnit = "ml" | "l" | string;

interface GoalErrorState {
  message: string;
  sessionExpired: boolean;
  /** Re-attempts the failed mutation with the same idempotency key. */
  retry: () => void;
}

/** A ml-unit goal is treated as "water-like" for the containers shortcut. */
function isMlGoal(goal: GoalProgressDTO): boolean {
  return (goal.unit ?? "").trim().toLowerCase() === "ml";
}

/** Round, useful quick-amount buttons for an arbitrary numeric target. */
function quickAmountsFor(target: number): number[] {
  const candidates = [
    Math.round(target * 0.25),
    Math.round(target * 0.5),
    Math.round(target),
  ];

  return Array.from(new Set(candidates.filter((value) => value > 0))).sort(
    (left, right) => left - right,
  );
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
}: {
  id: string;
  pending: boolean;
  onAdd: (amount: number) => void;
  inputLabel: string;
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
        placeholder="Amount"
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
        Custom amount
      </Label>
      <Input
        aria-invalid={validationError ? true : undefined}
        aria-label="Custom amount"
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
        aria-label="Custom unit"
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
        aria-label={`Remove ${container.label} (${container.volumeMl} ml)`}
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
        aria-label={`Add ${container.label} (${container.volumeMl} ml)`}
        disabled={pending || isPendingCreate}
        onClick={onAddContainer}
        variant="secondary"
      >
        +
      </Button>
    </div>
  );
}

function EmptyGoalsState({ userId }: { userId: string }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [addingTemplateId, setAddingTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const templatesQuery = useQuery({
    queryKey: queryKeys.goalTemplates(),
    queryFn: fetchGoalTemplates,
  });

  async function addFromTemplate(template: {
    id: string;
    name: string;
    targetValue: number | null;
    unit: string | null;
  }) {
    setAddingTemplateId(template.id);
    setError(null);
    try {
      await createGoal({
        name: template.name,
        targetValue: template.targetValue,
        unit: template.unit,
        templateId: template.id,
      });
      router.refresh();
    } catch {
      setError("Could not add that goal. Try again.");
    } finally {
      setAddingTemplateId(null);
    }
  }

  return (
    <div className="space-y-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Pick your goals</CardTitle>
          <p className="text-muted mt-1 text-sm">
            You&apos;re not tracking anything yet. Add a suggestion below or
            create your own — you need at least one to start.
          </p>
        </CardHeader>

        {templatesQuery.data && templatesQuery.data.length > 0 ? (
          <ul className="space-y-2">
            {templatesQuery.data.map((template) => (
              <li
                className="border-border flex items-center justify-between gap-3 rounded-xl border p-3"
                key={template.id}
              >
                <div>
                  <p className="font-medium">{template.name}</p>
                  <p className="text-muted text-xs">
                    {template.targetValue === null
                      ? "Checkbox goal"
                      : `Target: ${template.targetValue} ${template.unit}`}
                  </p>
                </div>
                <Button
                  disabled={addingTemplateId === template.id}
                  onClick={() => void addFromTemplate(template)}
                  variant="secondary"
                >
                  {addingTemplateId === template.id ? "Adding…" : "Add"}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <Button className="mt-4" onClick={() => setFormOpen(true)}>
          Add a custom goal
        </Button>

        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </Card>

      <GoalForm
        goal={null}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          router.refresh();
        }}
        open={formOpen}
        templates={templatesQuery.data ?? []}
      />

      <span className="sr-only" id={`tracker-user-${userId}`}>
        Tracker for current member
      </span>
    </div>
  );
}

/**
 * Shown instead of EmptyGoalsState when the member already has goals, but
 * none were active yet as of this particular day (e.g. reviewing yesterday
 * right after adding a first goal today) -- goal history is reconstructed
 * per day, so this is expected and not an invitation to add goals again.
 */
function NoGoalsActiveState({ localDate }: { localDate: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-muted text-sm">
        You hadn&apos;t added any goals yet as of {localDate}.
      </p>
    </div>
  );
}

export function DayTracker({
  initialDay,
  initialContainers,
  userId,
  today,
  amountInputMode,
  hasAnyGoals,
  firstViewableDate,
}: DayTrackerProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [day, setDay] = useState(initialDay);
  const [containers, setContainers] = useState(initialContainers);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [goalErrors, setGoalErrors] = useState<Record<string, GoalErrorState>>(
    {},
  );
  const [containersOpen, setContainersOpen] = useState(false);
  const [achievementToast, setAchievementToast] =
    useState<AchievementDTO | null>(null);
  const [preFillAmount, setPreFillAmount] = useState<Record<string, number>>(
    {},
  );
  const useSliders = amountInputMode === "slider";

  const dayCache = useRef<Record<string, DayRollupDTO>>({
    [initialDay.localDate]: initialDay,
  });
  const [dayLoading, setDayLoading] = useState(false);
  const [dayLoadError, setDayLoadError] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragAnimated, setDragAnimated] = useState(false);
  const swipeContainerRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swipeLockedHorizontal = useRef<boolean | null>(null);

  const prefetching = useRef<Set<string>>(new Set());

  useEffect(() => {
    dayCache.current[day.localDate] = day;
  }, [day]);

  async function prefetchDate(targetDate: string) {
    if (dayCache.current[targetDate] || prefetching.current.has(targetDate)) {
      return;
    }

    prefetching.current.add(targetDate);
    try {
      const fetched = await requestDayApi<DayRollupDTO>(
        `/api/day/${targetDate}`,
      );
      dayCache.current[targetDate] = fetched;
    } catch {
      // Best-effort: a real swipe to this date will retry and surface
      // any error through goToDate instead.
    } finally {
      prefetching.current.delete(targetDate);
    }
  }

  // Quietly warm the cache for the immediate neighbors of whichever day is
  // on screen, so a swipe in either direction usually resolves instantly.
  useEffect(() => {
    const previous = nextSwipeDate(
      day.localDate,
      "previous",
      firstViewableDate,
      today,
    );
    const next = nextSwipeDate(day.localDate, "next", firstViewableDate, today);

    if (previous) {
      void prefetchDate(previous);
    }
    if (next) {
      void prefetchDate(next);
    }
  }, [day.localDate, firstViewableDate, today]);

  async function goToDate(targetDate: string) {
    const cached = dayCache.current[targetDate];
    if (cached) {
      setDay(cached);
      return;
    }

    setDayLoading(true);
    setDayLoadError(null);
    try {
      const fetched = await requestDayApi<DayRollupDTO>(
        `/api/day/${targetDate}`,
      );
      dayCache.current[targetDate] = fetched;
      setDay(fetched);
    } catch (requestError) {
      setDayLoadError(apiErrorMessage(requestError));
    } finally {
      setDayLoading(false);
    }
  }

  function handleSwipeDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (dayLoading) {
      return;
    }
    // Let the amount slider's own drag own this gesture instead of also
    // paging the day underneath it.
    if ((event.target as HTMLElement).closest('input[type="range"]')) {
      swipeStart.current = null;
      return;
    }
    swipeStart.current = { x: event.clientX, y: event.clientY };
    swipeLockedHorizontal.current = null;
    setDragAnimated(false);
  }

  function handleSwipeMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || swipeLockedHorizontal.current === false) {
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (swipeLockedHorizontal.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
        return;
      }
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        // A vertical gesture (scrolling): stop tracking this touch entirely.
        swipeLockedHorizontal.current = false;
        return;
      }
      swipeLockedHorizontal.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    // A boundary (no earlier/later day to land on) resists the drag
    // entirely, rather than following the finger and springing back.
    const rawDirection = directionForSign(deltaX);
    const blocked = Boolean(
      rawDirection &&
      !nextSwipeDate(day.localDate, rawDirection, firstViewableDate, today),
    );
    setDragX(blocked ? 0 : deltaX);
  }

  function handleSwipeUp() {
    const wasHorizontal = swipeLockedHorizontal.current === true;
    swipeStart.current = null;
    swipeLockedHorizontal.current = null;

    if (!wasHorizontal) {
      return;
    }

    const width = swipeContainerRef.current?.offsetWidth || 320;
    const direction = resolveSwipeDirection(dragX, width);
    const target = direction
      ? nextSwipeDate(day.localDate, direction, firstViewableDate, today)
      : null;

    setDragAnimated(true);
    if (target) {
      // Keep sliding in whichever direction the finger was already moving.
      setDragX(dragX < 0 ? -width : width);
      window.setTimeout(() => {
        setDragX(0);
        setDragAnimated(false);
        void goToDate(target);
      }, 180);
    } else {
      setDragX(0);
    }
  }

  function isPending(goalId: string): boolean {
    return Boolean(pending[goalId]);
  }

  function setGoalError(goalId: string, state: GoalErrorState) {
    setGoalErrors((current) => ({ ...current, [goalId]: state }));
  }

  function clearGoalError(goalId: string) {
    setGoalErrors((current) => {
      if (!(goalId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[goalId];
      return next;
    });
  }

  function refreshRelatedData() {
    invalidateDayTracking(queryClient, userId, day.localDate);
    router.refresh();
  }

  function setGoalPending(goalId: string, value: boolean) {
    setPending((current) => ({ ...current, [goalId]: value }));
  }

  async function addAmount(
    goalId: string,
    amount: number,
    unit: AmountUnit,
    retryOperationId?: string,
  ) {
    if (isPending(goalId)) {
      return;
    }
    if (!day.editable) {
      return;
    }

    const previousGoalProgress = day.goals.find((goal) => goal.id === goalId);
    if (!previousGoalProgress) {
      return;
    }

    const operation = withOperationId(retryOperationId);
    const optimisticAmount =
      unit === "ml" || unit === "l"
        ? normalizeWaterAmount(amount, unit)
        : amount;
    setDay((prevDay) =>
      applyOptimisticAmount(prevDay, goalId, optimisticAmount, today),
    );
    setGoalPending(goalId, true);
    clearGoalError(goalId);

    try {
      const result = await requestDayApi<DayMutationResponse>(
        `/api/day/${day.localDate}/entries`,
        {
          method: "POST",
          headers: operation.headers,
          body: JSON.stringify({
            goalId,
            amount,
            unit: unit === "ml" || unit === "l" ? unit : undefined,
            clientOperationId: operation.operationId,
          }),
        },
      );
      const confirmed = result.day.goals.find((goal) => goal.id === goalId);
      setDay((prevDay) =>
        confirmed
          ? withGoalState(prevDay, goalId, confirmed, today)
          : result.day,
      );
      setAchievementToast(result.newAchievements?.[0] ?? null);
      refreshRelatedData();
    } catch (requestError) {
      setDay((prevDay) =>
        withGoalState(prevDay, goalId, previousGoalProgress, today),
      );
      setGoalError(goalId, {
        message: apiErrorMessage(requestError),
        sessionExpired:
          requestError instanceof DayApiError && requestError.status === 401,
        retry: () =>
          void addAmount(goalId, amount, unit, operation.operationId),
      });
    } finally {
      setGoalPending(goalId, false);
    }
  }

  async function addContainer(
    goalId: string,
    container: ContainerDTO,
    retryOperationId?: string,
  ) {
    if (isPending(goalId)) {
      return;
    }
    if (!day.editable) {
      return;
    }

    const previousGoalProgress = day.goals.find((goal) => goal.id === goalId);
    if (!previousGoalProgress) {
      return;
    }

    const operation = withOperationId(retryOperationId);
    setDay((prevDay) =>
      applyOptimisticAmount(prevDay, goalId, container.volumeMl, today),
    );
    setGoalPending(goalId, true);
    clearGoalError(goalId);

    try {
      const result = await requestDayApi<DayMutationResponse>(
        `/api/day/${day.localDate}/entries`,
        {
          method: "POST",
          headers: operation.headers,
          body: JSON.stringify({
            goalId,
            containerId: container.id,
            clientOperationId: operation.operationId,
          }),
        },
      );
      const confirmed = result.day.goals.find((goal) => goal.id === goalId);
      setDay((prevDay) =>
        confirmed
          ? withGoalState(prevDay, goalId, confirmed, today)
          : result.day,
      );
      setAchievementToast(result.newAchievements?.[0] ?? null);
      refreshRelatedData();
    } catch (requestError) {
      setDay((prevDay) =>
        withGoalState(prevDay, goalId, previousGoalProgress, today),
      );
      setGoalError(goalId, {
        message: apiErrorMessage(requestError),
        sessionExpired:
          requestError instanceof DayApiError && requestError.status === 401,
        retry: () =>
          void addContainer(goalId, container, operation.operationId),
      });
    } finally {
      setGoalPending(goalId, false);
    }
  }

  /** Simple independent flip, for a checkbox goal (no numeric target). */
  async function toggleGoalDone(goalId: string, retryOperationId?: string) {
    if (isPending(goalId)) {
      return;
    }
    if (!day.editable) {
      return;
    }

    const previousGoalProgress = day.goals.find((goal) => goal.id === goalId);
    if (!previousGoalProgress) {
      return;
    }

    const operation = withOperationId(retryOperationId);
    setDay((prevDay) => applyOptimisticGoalDone(prevDay, goalId, today));
    setGoalPending(goalId, true);
    clearGoalError(goalId);

    try {
      const result = await requestDayApi<DayMutationResponse>(
        `/api/day/${day.localDate}/goals/${goalId}/toggle-done`,
        {
          method: "POST",
          headers: operation.headers,
          body: JSON.stringify({ clientOperationId: operation.operationId }),
        },
      );
      const confirmed = result.day.goals.find((goal) => goal.id === goalId);
      setDay((prevDay) =>
        confirmed
          ? withGoalState(prevDay, goalId, confirmed, today)
          : result.day,
      );
      setAchievementToast(result.newAchievements?.[0] ?? null);
      refreshRelatedData();
    } catch (requestError) {
      setDay((prevDay) =>
        withGoalState(prevDay, goalId, previousGoalProgress, today),
      );
      setGoalError(goalId, {
        message: apiErrorMessage(requestError),
        sessionExpired:
          requestError instanceof DayApiError && requestError.status === 401,
        retry: () => void toggleGoalDone(goalId, operation.operationId),
      });
    } finally {
      setGoalPending(goalId, false);
    }
  }

  /**
   * The slider picks an absolute total; the ledger only accepts signed
   * deltas, so translate before hitting the same endpoint the steppers use.
   */
  function setAmountTo(goalId: string, nextValue: number, unit: AmountUnit) {
    const current = day.goals.find((goal) => goal.id === goalId);
    const delta = amountDeltaTo(current?.amount ?? 0, nextValue);
    if (delta === 0) {
      return;
    }

    void addAmount(goalId, delta, unit);
  }

  /**
   * The checkmark on a numeric goal is a fill/undo shortcut, not an
   * independent flag: checking it fills the amount to the target, and
   * checking it again restores whatever amount was logged right before
   * that fill. Reaching the target by dragging the slider itself still
   * locks the checkmark (see isAmountToggleLocked) since there is no
   * "previous amount" to restore to.
   */
  function toggleAmountFill(goalId: string, unit: AmountUnit) {
    if (isPending(goalId)) {
      return;
    }
    if (!day.editable) {
      return;
    }

    const progress = day.goals.find((goal) => goal.id === goalId);
    if (!progress || progress.target === undefined) {
      return;
    }

    const amount = progress.amount ?? 0;
    const resolution = resolveAmountFill(
      amount,
      progress.target,
      preFillAmount[goalId],
    );

    if (resolution.action === "locked") {
      return;
    }

    setPreFillAmount((current) => {
      const next = { ...current };
      if (resolution.action === "fill") {
        next[goalId] = amount;
      } else {
        delete next[goalId];
      }
      return next;
    });
    setAmountTo(goalId, resolution.nextValue, unit);
  }

  function isAmountToggleLocked(goalId: string): boolean {
    const progress = day.goals.find((goal) => goal.id === goalId);
    if (
      !progress ||
      progress.amount === undefined ||
      progress.target === undefined
    ) {
      return false;
    }

    return (
      progress.amount >= progress.target && preFillAmount[goalId] === undefined
    );
  }

  const percentComplete =
    day.totalCount > 0 ? Math.round((day.metCount / day.totalCount) * 100) : 0;

  const content =
    day.goals.length === 0 ? (
      hasAnyGoals ? (
        <NoGoalsActiveState localDate={day.localDate} />
      ) : (
        <EmptyGoalsState userId={userId} />
      )
    ) : (
      <div className="space-y-4 pb-6">
        <div className="pt-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-muted text-sm font-semibold tracking-wide">
                Day
              </p>
              <h1 className="text-4xl font-bold tracking-tight">
                {day.dayNumber}
              </h1>
            </div>
            <div className="text-right">
              <p className="text-muted text-sm font-semibold tracking-wide">
                Complete
              </p>
              <p className="text-4xl font-bold tracking-tight">
                {percentComplete}%
              </p>
            </div>
          </div>
          <div
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percentComplete}
            aria-valuetext={`${day.metCount} of ${day.totalCount} goals met`}
            className="bg-surface-accent mt-4 h-3 w-full overflow-hidden rounded-full"
            role="progressbar"
          >
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-300"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
          {!day.editable ? (
            <p className="text-muted mt-3 rounded-xl bg-slate-100 p-3 text-sm">
              This day is view-only. Only today and yesterday can be changed.
            </p>
          ) : null}
          {day.invalidated ? (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
              This day was invalidated by an administrator.
            </p>
          ) : null}
        </div>

        {day.goals.map((goal) => {
          const goalPending = isPending(goal.id) || !day.editable;
          const goalErrorState = goalErrors[goal.id];
          const isNumeric = goal.target !== undefined;
          const unit = goal.unit ?? "";
          const showContainers = isNumeric && isMlGoal(goal);

          if (!isNumeric) {
            return (
              <GoalControl
                error={goalErrorState?.message}
                key={goal.id}
                onRetry={goalErrorState?.retry}
                onToggleDone={() => void toggleGoalDone(goal.id)}
                pending={goalPending}
                progress={goal}
                sessionExpired={goalErrorState?.sessionExpired}
                title={goal.name}
              />
            );
          }

          const target = goal.target ?? 0;

          return (
            <GoalControl
              error={goalErrorState?.message}
              key={goal.id}
              onRetry={goalErrorState?.retry}
              onToggleDone={() => toggleAmountFill(goal.id, unit)}
              pending={goalPending}
              progress={goal}
              sessionExpired={goalErrorState?.sessionExpired}
              title={goal.name}
              titleAction={
                showContainers ? (
                  <Button
                    aria-label={`Manage ${goal.name} containers`}
                    className="min-h-0 px-2 py-1 text-xs"
                    disabled={isPending(goal.id)}
                    onClick={() => setContainersOpen(true)}
                    variant="ghost"
                  >
                    Containers
                  </Button>
                ) : undefined
              }
              toggleLocked={isAmountToggleLocked(goal.id)}
            >
              {useSliders ? (
                <AmountSlider
                  disabled={goalPending}
                  label={goal.name}
                  onCommit={(next) => setAmountTo(goal.id, next, unit)}
                  step={showContainers ? 50 : 1}
                  target={target}
                  unitLabel={unit}
                  value={goal.amount ?? 0}
                />
              ) : (
                <>
                  {quickAmountsFor(target).map((amount) => (
                    <AmountStepper
                      amount={amount}
                      key={amount}
                      label={goal.name}
                      onAdjust={(signed) =>
                        void addAmount(goal.id, signed, unit)
                      }
                      pending={goalPending}
                      unitLabel={unit}
                    />
                  ))}
                  {showContainers
                    ? containers.map((container) => (
                        <ContainerStepper
                          container={container}
                          key={container.id}
                          onAddContainer={() =>
                            void addContainer(goal.id, container)
                          }
                          onRemoveContainer={() =>
                            void addAmount(goal.id, -container.volumeMl, "ml")
                          }
                          pending={goalPending}
                        />
                      ))
                    : null}
                  {showContainers ? (
                    <CustomWaterAmountForm
                      id={`${goal.id}-custom-amount`}
                      onAdd={(amount, addUnit) =>
                        void addAmount(goal.id, amount, addUnit)
                      }
                      pending={goalPending}
                    />
                  ) : (
                    <CustomAmountForm
                      id={`${goal.id}-custom-amount`}
                      inputLabel={`${goal.name} amount to add or remove`}
                      onAdd={(amount) => void addAmount(goal.id, amount, unit)}
                      pending={goalPending}
                    />
                  )}
                </>
              )}
            </GoalControl>
          );
        })}
      </div>
    );

  return (
    <div>
      <div
        className="min-h-[60vh]"
        onPointerCancel={handleSwipeUp}
        onPointerDown={handleSwipeDown}
        onPointerMove={handleSwipeMove}
        onPointerUp={handleSwipeUp}
        ref={swipeContainerRef}
        style={{ touchAction: "pan-y" }}
      >
        <div
          style={{
            transform: dragX ? `translateX(${dragX}px)` : undefined,
            transition: dragAnimated ? "transform 180ms ease-out" : "none",
            opacity: dayLoading ? 0.5 : 1,
          }}
        >
          {content}
        </div>
      </div>

      {dayLoadError ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {dayLoadError}
        </p>
      ) : null}

      <Sheet
        onClose={() => setContainersOpen(false)}
        open={containersOpen}
        title="Water containers"
      >
        <p className="text-muted mb-4 text-sm">
          Manage your saved containers here. Each one shows up as its own − / +
          stepper on any goal measured in ml.
        </p>
        <ContainerManager
          containers={containers}
          onContainersChange={setContainers}
        />
      </Sheet>

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
