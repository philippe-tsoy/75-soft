"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { AchievementToast } from "@/components/achievements";
import { Sheet } from "@/components/sheets/sheet";
import { Button, Input, Label } from "@/components/ui";
import {
  MAX_NOTE_CHARACTERS,
  MAX_POST_PHOTO_BYTES,
  POST_PHOTO_MIME_TYPES,
} from "@/lib/config/75-soft";
import { getYesterday } from "@/lib/dates";
import { queryKeys } from "@/lib/query-keys";
import { validateImage } from "@/lib/storage";
import type { AchievementDTO, DayRollupDTO, GoalDTO } from "@/lib/types";

interface PostComposerProps {
  open: boolean;
  goals: GoalDTO[];
  userId: string;
  today: string;
  allowYesterday?: boolean;
  onClose: () => void;
  onPosted: () => void;
}

interface PostMutationPayload {
  data?: {
    newAchievements?: AchievementDTO[];
  };
  error?: { message?: string };
}

function createBrowserOperationId(): string {
  return crypto.randomUUID();
}

function photoErrorMessage(error: "unsupported_type" | "too_large" | "empty") {
  switch (error) {
    case "too_large":
      return "Photos must be 5 MB or smaller.";
    case "unsupported_type":
      return "Use a JPEG, PNG, or WebP photo.";
    default:
      return "Choose a non-empty photo.";
  }
}

async function fetchDay(localDate: string): Promise<DayRollupDTO> {
  const response = await fetch(`/api/day/${localDate}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: DayRollupDTO;
  } | null;

  if (!response.ok || !payload?.data) {
    throw new Error("Could not load your progress for that day.");
  }

  return payload.data;
}

export function PostComposer({
  open,
  goals,
  userId,
  today,
  allowYesterday = true,
  onClose,
  onPosted,
}: PostComposerProps) {
  const router = useRouter();
  const [localDate, setLocalDate] = useState<"today" | "yesterday">("today");
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [goalValues, setGoalValues] = useState<Record<string, string>>({});
  const [goalCompleted, setGoalCompleted] = useState<Record<string, boolean>>(
    {},
  );
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [achievementToast, setAchievementToast] =
    useState<AchievementDTO | null>(null);

  const resolvedDate = localDate === "today" ? today : getYesterday(today);
  const dayQuery = useQuery({
    queryKey: queryKeys.day(userId, resolvedDate),
    queryFn: () => fetchDay(resolvedDate),
    enabled: open,
  });
  const day = dayQuery.data;
  const ready = Boolean(
    day && day.totalCount > 0 && day.metCount >= day.totalCount,
  );

  const toggleGoal = (id: string) => {
    setSelectedGoalIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  };

  const resetDraft = () => {
    setLocalDate("today");
    setSelectedGoalIds([]);
    setGoalValues({});
    setGoalCompleted({});
    setNote("");
    setPhoto(null);
    setPhotoError(null);
    setError(null);
    setOperationId(null);
  };

  const handlePhoto = (next: File | null) => {
    if (!next) {
      setPhoto(null);
      setPhotoError(null);
      return;
    }

    const validation = validateImage(next, POST_PHOTO_MIME_TYPES);
    if (!validation.valid) {
      setPhoto(null);
      setPhotoError(photoErrorMessage(validation.error ?? "empty"));
      return;
    }

    setPhoto(next);
    setPhotoError(null);
  };

  function goToTracker() {
    onClose();
    router.push(localDate === "today" ? "/today" : "/yesterday");
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!photo) {
      setError("A photo is required to post an update.");
      return;
    }
    if (photoError) {
      return;
    }

    try {
      const selectedGoals = selectedGoalIds.map((id) => {
        const goal = goals.find((entry) => entry.id === id);
        if (!goal) {
          throw new Error("One selected goal is no longer available.");
        }

        if (goal.targetValue === null) {
          return {
            goalId: id,
            completed: goalCompleted[id] ?? false,
          };
        }

        const value = Number(goalValues[id]);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error(`${goal.name} needs a positive value.`);
        }

        return {
          goalId: id,
          value,
        };
      });

      let nextOperationId = operationId;
      if (!nextOperationId) {
        nextOperationId = createBrowserOperationId();
        setOperationId(nextOperationId);
      }

      const formData = new FormData();
      formData.set("localDate", localDate);
      formData.set("goals", JSON.stringify(selectedGoals));
      formData.set("note", note);
      formData.set("clientOperationId", nextOperationId);
      formData.set("photo", photo);

      setSubmitting(true);
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "x-client-operation-id": nextOperationId },
        body: formData,
      });
      const payload = (await response
        .json()
        .catch(() => null)) as PostMutationPayload | null;

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Unable to publish post.");
      }

      const newAchievement = payload?.data?.newAchievements?.[0];
      if (newAchievement) {
        setAchievementToast(newAchievement);
      }
      resetDraft();
      onPosted();
      onClose();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to publish post. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Sheet
        className="sm:max-w-2xl"
        onClose={() => {
          if (!submitting) {
            onClose();
          }
        }}
        open={open}
        title="Post update"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="post-local-date">Day</Label>
            <select
              className="border-border bg-card text-foreground focus-visible:ring-primary min-h-11 w-full rounded-xl border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              data-sheet-autofocus
              id="post-local-date"
              onChange={(event) =>
                setLocalDate(event.target.value as "today" | "yesterday")
              }
              value={localDate}
            >
              <option value="today">Today</option>
              <option disabled={!allowYesterday} value="yesterday">
                {allowYesterday ? "Yesterday" : "Yesterday (not available yet)"}
              </option>
            </select>
          </div>

          {dayQuery.isPending ? (
            <p className="text-muted text-sm">Loading your progress…</p>
          ) : null}

          {dayQuery.isError ? (
            <div className="space-y-2">
              <p className="text-sm text-red-700" role="alert">
                Could not load your progress for that day.
              </p>
              <Button
                onClick={() => void dayQuery.refetch()}
                type="button"
                variant="secondary"
              >
                Retry
              </Button>
            </div>
          ) : null}

          {day && !ready ? (
            <div className="border-border space-y-3 rounded-xl border border-dashed p-4">
              <p className="font-semibold">
                Finish {localDate}&rsquo;s goals to post
              </p>
              <p className="text-muted text-sm">
                {day.totalCount === 0
                  ? "You need at least one goal before you can post — add one on the tracker."
                  : "A post shares that day's results with a photo, so every goal needs to be met first."}
              </p>
              {day.totalCount > 0 ? (
                <ul className="space-y-1 text-sm">
                  {day.goals.map((goal) => (
                    <li
                      className="flex items-center justify-between"
                      key={goal.id}
                    >
                      <span>{goal.name}</span>
                      <span
                        className={
                          goal.met ? "text-emerald-700" : "text-muted"
                        }
                      >
                        {goal.met ? "Met" : "Not yet"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button onClick={goToTracker} type="button">
                Go finish {localDate}&rsquo;s goals
              </Button>
            </div>
          ) : null}

          {day && ready ? (
            <form className="space-y-5" onSubmit={submit}>
              <fieldset className="border-border space-y-2 rounded-xl border p-3">
                <legend className="text-foreground px-1 text-sm font-semibold">
                  {localDate === "today" ? "Today" : "Yesterday"}&rsquo;s
                  results
                </legend>
                <ul className="space-y-1 text-sm">
                  {day.goals.map((goal) => (
                    <li
                      className="flex items-center justify-between"
                      key={goal.id}
                    >
                      <span>{goal.name}</span>
                      <span className="text-emerald-700">
                        ✓{" "}
                        {goal.target === undefined
                          ? "Met"
                          : `${goal.amount ?? 0} ${goal.unit ?? ""}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </fieldset>

              {goals.length > 0 ? (
                <fieldset className="space-y-3">
                  <legend className="text-foreground text-sm font-semibold">
                    Attach goals to this post
                  </legend>
                  <div className="space-y-2">
                    {goals.map((goal) => {
                      const selected = selectedGoalIds.includes(goal.id);
                      return (
                        <div
                          className="border-border bg-card rounded-xl border p-3"
                          key={goal.id}
                        >
                          <button
                            aria-pressed={selected}
                            className={`min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold ${
                              selected
                                ? "bg-surface-accent text-primary"
                                : "hover:bg-surface-accent"
                            }`}
                            onClick={() => toggleGoal(goal.id)}
                            type="button"
                          >
                            {selected ? "✓ " : ""}
                            {goal.name}
                          </button>
                          {selected && goal.targetValue !== null ? (
                            <div className="mt-3 flex items-center gap-2">
                              <Label className="sr-only" htmlFor={`goal-${goal.id}`}>
                                {goal.name} value
                              </Label>
                              <Input
                                id={`goal-${goal.id}`}
                                min="0"
                                onChange={(event) =>
                                  setGoalValues((current) => ({
                                    ...current,
                                    [goal.id]: event.target.value,
                                  }))
                                }
                                step="any"
                                type="number"
                                value={goalValues[goal.id] ?? ""}
                              />
                              <span className="text-muted text-sm">
                                {goal.unit}
                              </span>
                            </div>
                          ) : selected ? (
                            <label className="text-muted mt-2 flex min-h-11 items-center gap-2 text-sm">
                              <input
                                checked={goalCompleted[goal.id] ?? false}
                                className="size-5"
                                onChange={(event) =>
                                  setGoalCompleted((current) => ({
                                    ...current,
                                    [goal.id]: event.target.checked,
                                  }))
                                }
                                type="checkbox"
                              />
                              Completed
                            </label>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <p className="text-muted text-sm">
                  Your goals appear here once you add them on the tracker.
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="post-note">Note (optional)</Label>
                <textarea
                  className="border-border bg-card text-foreground placeholder:text-muted focus-visible:ring-primary min-h-24 w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                  id="post-note"
                  maxLength={MAX_NOTE_CHARACTERS}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add a little context…"
                  value={note}
                />
                <p className="text-muted text-xs">
                  {note.length}/{MAX_NOTE_CHARACTERS} characters
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="post-photo">Photo</Label>
                <input
                  accept={POST_PHOTO_MIME_TYPES.join(",")}
                  aria-required="true"
                  className="border-border bg-card text-foreground min-h-11 w-full rounded-xl border p-2 text-sm"
                  id="post-photo"
                  onChange={(event) =>
                    handlePhoto(event.currentTarget.files?.[0] ?? null)
                  }
                  required
                  type="file"
                />
                {photo ? (
                  <p className="text-muted text-xs">
                    {photo.name} · {(photo.size / 1_000_000).toFixed(2)} MB
                  </p>
                ) : null}
                <p className="text-muted text-xs">
                  JPEG, PNG, or WebP up to {MAX_POST_PHOTO_BYTES / 1_000_000}{" "}
                  MB.
                </p>
                {photoError ? (
                  <p className="text-sm text-red-700" role="alert">
                    {photoError}
                  </p>
                ) : null}
              </div>

              {error ? (
                <p
                  aria-live="assertive"
                  className="text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <Button className="w-full" disabled={submitting} type="submit">
                {submitting ? "Posting…" : "Post update"}
              </Button>
              {operationId && error ? (
                <p className="text-muted text-center text-xs">
                  Retry will safely reuse this submission.
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      </Sheet>
      <AchievementToast
        onDismiss={() => setAchievementToast(null)}
        toast={achievementToast}
      />
    </>
  );
}
