"use client";

import { useState, type FormEvent } from "react";

import { AchievementToast } from "@/components/achievements";
import { Sheet } from "@/components/sheets/sheet";
import { Button, Input, Label } from "@/components/ui";
import {
  COHORT_START_DATE,
  MAX_NOTE_CHARACTERS,
  MAX_POST_PHOTO_BYTES,
  POST_PHOTO_MIME_TYPES,
  REQUIRED_GOALS,
  REQUIRED_GOAL_KEYS,
} from "@/lib/config/75-soft";
import { validateImage } from "@/lib/storage";
import type {
  AchievementDTO,
  OptionalGoalDTO,
  RequiredGoalKey,
} from "@/lib/types";

type AmountGoalKey = Exclude<RequiredGoalKey, "diet">;

interface PostComposerProps {
  open: boolean;
  optionalGoals: OptionalGoalDTO[];
  onClose: () => void;
  onPosted: () => void;
}

interface Amounts {
  workout: string;
  water: string;
  reading: string;
}

interface Units {
  workout: "minutes";
  water: "ml" | "l";
  reading: "pages";
}

interface PostMutationPayload {
  data?: {
    newAchievements?: AchievementDTO[];
  };
  error?: { message?: string };
}

function initialAmounts(): Amounts {
  return {
    workout: "1",
    water: "250",
    reading: "1",
  };
}

function initialUnits(): Units {
  return {
    workout: "minutes",
    water: "ml",
    reading: "pages",
  };
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

export function PostComposer({
  open,
  optionalGoals,
  onClose,
  onPosted,
}: PostComposerProps) {
  const [localDate, setLocalDate] = useState<"today" | "yesterday">("today");
  const [selectedRequired, setSelectedRequired] = useState<RequiredGoalKey[]>(
    [],
  );
  const [selectedOptional, setSelectedOptional] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Amounts>(initialAmounts);
  const [units, setUnits] = useState<Units>(initialUnits);
  const [optionalValues, setOptionalValues] = useState<Record<string, string>>(
    {},
  );
  const [optionalCompleted, setOptionalCompleted] = useState<
    Record<string, boolean>
  >({});
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [achievementToast, setAchievementToast] =
    useState<AchievementDTO | null>(null);

  const toggleRequired = (key: RequiredGoalKey) => {
    setSelectedRequired((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
  };

  const toggleOptional = (id: string) => {
    setSelectedOptional((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  };

  const resetDraft = () => {
    setLocalDate("today");
    setSelectedRequired([]);
    setSelectedOptional([]);
    setAmounts(initialAmounts());
    setUnits(initialUnits());
    setOptionalValues({});
    setOptionalCompleted({});
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (selectedRequired.length + selectedOptional.length === 0) {
      setError("Select at least one goal.");
      return;
    }
    if (photoError) {
      return;
    }

    try {
      const goals = [
        ...selectedRequired.map((key) => {
          if (key === "diet") {
            return { kind: "required" as const, key };
          }

          const amount = Number(amounts[key]);
          if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new Error(
              `${REQUIRED_GOALS[key].label} needs a whole number.`,
            );
          }

          return {
            kind: "required" as const,
            key,
            amount,
            unit: units[key],
          };
        }),
        ...selectedOptional.map((id) => {
          const goal = optionalGoals.find((entry) => entry.id === id);
          if (!goal) {
            throw new Error(
              "One selected optional goal is no longer available.",
            );
          }

          if (goal.targetValue === null) {
            return {
              kind: "optional" as const,
              optionalGoalId: id,
              completed: optionalCompleted[id] ?? false,
            };
          }

          const value = Number(optionalValues[id]);
          if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`${goal.name} needs a positive value.`);
          }

          return {
            kind: "optional" as const,
            optionalGoalId: id,
            value,
          };
        }),
      ];

      let nextOperationId = operationId;
      if (!nextOperationId) {
        nextOperationId = createBrowserOperationId();
        setOperationId(nextOperationId);
      }

      const formData = new FormData();
      formData.set("localDate", localDate);
      formData.set("goals", JSON.stringify(goals));
      formData.set("note", note);
      formData.set("clientOperationId", nextOperationId);
      if (photo) {
        formData.set("photo", photo);
      }

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
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="post-local-date">Day</Label>
            <select
              className="border-border bg-card text-foreground focus-visible:ring-primary min-h-11 w-full rounded-xl border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              id="post-local-date"
              onChange={(event) =>
                setLocalDate(event.target.value as "today" | "yesterday")
              }
              value={localDate}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
            </select>
            <p className="text-muted text-xs">
              The server checks your local date and the active challenge window.
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-foreground text-sm font-semibold">
              Goals
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {REQUIRED_GOAL_KEYS.map((key) => {
                const selected = selectedRequired.includes(key);
                return (
                  <div
                    className="border-border bg-card rounded-xl border p-3"
                    key={key}
                  >
                    <button
                      aria-pressed={selected}
                      className={`min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold ${
                        selected
                          ? "bg-surface-accent text-primary"
                          : "hover:bg-surface-accent"
                      }`}
                      onClick={() => toggleRequired(key)}
                      type="button"
                    >
                      {selected ? "✓ " : ""}
                      {REQUIRED_GOALS[key].label}
                    </button>
                    {selected && key !== "diet" ? (
                      <div className="mt-3 flex gap-2">
                        <Label
                          className="sr-only"
                          htmlFor={`post-${key}-amount`}
                        >
                          {REQUIRED_GOALS[key].label} amount
                        </Label>
                        <Input
                          id={`post-${key}-amount`}
                          min="1"
                          onChange={(event) =>
                            setAmounts((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          type="number"
                          value={amounts[key as AmountGoalKey]}
                        />
                        {key === "water" ? (
                          <select
                            aria-label="Water unit"
                            className="border-border bg-card min-h-11 rounded-xl border px-3 text-sm"
                            onChange={(event) =>
                              setUnits((current) => ({
                                ...current,
                                water: event.target.value as "ml" | "l",
                              }))
                            }
                            value={units.water}
                          >
                            <option value="ml">ml</option>
                            <option value="l">L</option>
                          </select>
                        ) : (
                          <span className="text-muted flex items-center px-2 text-sm">
                            {REQUIRED_GOALS[key].unit}
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>

          {optionalGoals.length > 0 ? (
            <fieldset className="space-y-3">
              <legend className="text-foreground text-sm font-semibold">
                Optional goals
              </legend>
              <div className="space-y-2">
                {optionalGoals.map((goal) => {
                  const selected = selectedOptional.includes(goal.id);
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
                        onClick={() => toggleOptional(goal.id)}
                        type="button"
                      >
                        {selected ? "✓ " : ""}
                        {goal.name}
                      </button>
                      {selected && goal.targetValue !== null ? (
                        <div className="mt-3 flex items-center gap-2">
                          <Label
                            className="sr-only"
                            htmlFor={`optional-${goal.id}`}
                          >
                            {goal.name} value
                          </Label>
                          <Input
                            id={`optional-${goal.id}`}
                            min="0"
                            onChange={(event) =>
                              setOptionalValues((current) => ({
                                ...current,
                                [goal.id]: event.target.value,
                              }))
                            }
                            step="any"
                            type="number"
                            value={optionalValues[goal.id] ?? ""}
                          />
                          <span className="text-muted text-sm">
                            {goal.unit}
                          </span>
                        </div>
                      ) : selected ? (
                        <label className="text-muted mt-2 flex min-h-11 items-center gap-2 text-sm">
                          <input
                            checked={optionalCompleted[goal.id] ?? false}
                            className="size-5"
                            onChange={(event) =>
                              setOptionalCompleted((current) => ({
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
              Optional goals appear here once you create them in Me.
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
            <Label htmlFor="post-photo">Photo (optional)</Label>
            <input
              accept={POST_PHOTO_MIME_TYPES.join(",")}
              className="border-border bg-card text-foreground min-h-11 w-full rounded-xl border p-2 text-sm"
              id="post-photo"
              onChange={(event) =>
                handlePhoto(event.currentTarget.files?.[0] ?? null)
              }
              type="file"
            />
            {photo ? (
              <p className="text-muted text-xs">
                {photo.name} · {(photo.size / 1_000_000).toFixed(2)} MB
              </p>
            ) : null}
            <p className="text-muted text-xs">
              JPEG, PNG, or WebP up to {MAX_POST_PHOTO_BYTES / 1_000_000} MB.
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
          <p className="text-muted text-center text-xs">
            Challenge started {COHORT_START_DATE}.
          </p>
        </form>
      </Sheet>
      <AchievementToast
        onDismiss={() => setAchievementToast(null)}
        toast={achievementToast}
      />
    </>
  );
}
