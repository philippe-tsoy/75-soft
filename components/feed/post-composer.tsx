"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { AchievementToast } from "@/components/achievements";
import { Sheet } from "@/components/sheets/sheet";
import { Button, Label } from "@/components/ui";
import {
  MAX_NOTE_CHARACTERS,
  MAX_POST_PHOTO_BYTES,
  POST_PHOTO_MIME_TYPES,
} from "@/lib/config/75-soft";
import { queryKeys } from "@/lib/query-keys";
import { validateImage } from "@/lib/storage";
import type { AchievementDTO, DayRollupDTO } from "@/lib/types";

interface PostComposerProps {
  open: boolean;
  userId: string;
  today: string;
  onClose: () => void;
  onPosted: () => void;
}

interface PostGoalPayload {
  goalId: string;
  value?: number;
  completed?: boolean;
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

/** Every goal is already met once posting unlocks, so it attaches as-is. */
function attachedGoalsFor(day: DayRollupDTO): PostGoalPayload[] {
  return day.goals.map((goal) =>
    goal.target === undefined
      ? { goalId: goal.id, completed: true }
      : { goalId: goal.id, value: goal.amount ?? goal.target },
  );
}

function CameraIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={28}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      width={28}
    >
      <path d="M4 8a2 2 0 0 1 2-2h1.2a1 1 0 0 0 .89-.55l.42-.9A1 1 0 0 1 9.4 4h5.2a1 1 0 0 1 .9.55l.42.9a1 1 0 0 0 .88.55H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function PhotoPicker({
  photo,
  error,
  onChange,
}: {
  photo: File | null;
  error: string | null;
  onChange: (file: File | null) => void;
}) {
  const previewUrl = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="space-y-2">
      <Label htmlFor="post-photo">Photo</Label>
      <label
        className="border-border bg-card hover:bg-surface-accent focus-within:ring-primary flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center transition-colors focus-within:ring-2 focus-within:ring-offset-2"
        htmlFor="post-photo"
      >
        {photo && previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote/optimizable image */}
            <img
              alt=""
              className="h-28 w-28 rounded-xl object-cover shadow-sm"
              src={previewUrl}
            />
            <p className="max-w-full truncate text-sm font-medium">
              {photo.name}
            </p>
            <p className="text-muted text-xs">
              {(photo.size / 1_000_000).toFixed(2)} MB · Tap to change
            </p>
          </>
        ) : (
          <>
            <span className="bg-surface-accent text-primary flex h-14 w-14 items-center justify-center rounded-full">
              <CameraIcon />
            </span>
            <p className="text-sm font-semibold">Add a photo</p>
            <p className="text-muted text-xs">
              JPEG, PNG, or WebP up to {MAX_POST_PHOTO_BYTES / 1_000_000} MB
            </p>
          </>
        )}
        <input
          accept={POST_PHOTO_MIME_TYPES.join(",")}
          aria-required="true"
          className="sr-only"
          id="post-photo"
          onChange={(event) => onChange(event.currentTarget.files?.[0] ?? null)}
          required
          type="file"
        />
      </label>
      {photo ? (
        <button
          className="text-primary text-xs font-semibold"
          onClick={() => onChange(null)}
          type="button"
        >
          Remove photo
        </button>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PostComposer({
  open,
  userId,
  today,
  onClose,
  onPosted,
}: PostComposerProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [achievementToast, setAchievementToast] =
    useState<AchievementDTO | null>(null);

  const dayQuery = useQuery({
    queryKey: queryKeys.day(userId, today),
    queryFn: () => fetchDay(today),
    enabled: open,
  });
  const day = dayQuery.data;
  const ready = Boolean(
    day && day.totalCount > 0 && day.metCount >= day.totalCount,
  );

  const resetDraft = () => {
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

    if (!day) {
      return;
    }
    if (!photo) {
      setError("A photo is required to post an update.");
      return;
    }
    if (photoError) {
      return;
    }

    try {
      let nextOperationId = operationId;
      if (!nextOperationId) {
        nextOperationId = createBrowserOperationId();
        setOperationId(nextOperationId);
      }

      const formData = new FormData();
      formData.set("localDate", "today");
      formData.set("goals", JSON.stringify(attachedGoalsFor(day)));
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
          {dayQuery.isPending ? (
            <p className="text-muted text-sm">Loading your progress…</p>
          ) : null}

          {dayQuery.isError ? (
            <div className="space-y-2">
              <p className="text-sm text-red-700" role="alert">
                Could not load your progress for today.
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
                Finish today&rsquo;s goals to post
              </p>
              <p className="text-muted text-sm">
                {day.totalCount === 0
                  ? "You need at least one goal before you can post — add one on the tracker."
                  : "A post shares today's results with a photo, so every goal needs to be met first."}
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
                        className={goal.met ? "text-emerald-700" : "text-muted"}
                      >
                        {goal.met ? "Met" : "Not yet"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button
                onClick={() => {
                  onClose();
                  router.push("/today");
                }}
                type="button"
              >
                Go finish today&rsquo;s goals
              </Button>
            </div>
          ) : null}

          {day && ready ? (
            <form className="space-y-5" onSubmit={submit}>
              <fieldset className="border-border space-y-2 rounded-xl border p-3">
                <legend className="text-foreground px-1 text-sm font-semibold">
                  Today&rsquo;s results
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
                <p className="text-muted px-1 text-xs">
                  Every goal above posts along with this update.
                </p>
              </fieldset>

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

              <PhotoPicker
                error={photoError}
                onChange={handlePhoto}
                photo={photo}
              />

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
