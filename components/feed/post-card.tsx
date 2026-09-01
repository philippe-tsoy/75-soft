"use client";

/* eslint-disable @next/next/no-img-element -- signed private URLs are runtime data. */
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Lightbox } from "@/components/lightbox/lightbox";
import { Button, Card, Input } from "@/components/ui";
import {
  COHORT_START_DATE,
  DEFAULT_REACTION_PALETTE,
  REQUIRED_GOALS,
  REQUIRED_GOAL_KEYS,
} from "@/lib/config/75-soft";
import { formatInstantForViewer, getDayNumber } from "@/lib/dates";
import { commentBodySchema, graphemeLength } from "@/lib/validation";
import type { PostDTO, PostRequiredSnapshotDTO, RequiredGoalKey } from "@/lib/types";

interface PostCardProps {
  post: PostDTO;
  reactionPalette?: readonly string[];
  onChanged: () => void;
  onDeleted: () => void;
}

interface ApiFailure {
  error?: {
    message?: string;
  };
}

function displayTimestamp(value: string): string {
  try {
    return formatInstantForViewer(
      value,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  } catch {
    return value;
  }
}

function createBrowserOperationId(): string {
  return crypto.randomUUID();
}

function displayRequiredGoal(
  key: RequiredGoalKey,
  snapshot: PostRequiredSnapshotDTO,
): string {
  const label = REQUIRED_GOALS[key].label;
  if (key === "diet") {
    return `${label}: met`;
  }

  const goal = snapshot[key];
  return `${label}: ${goal.amount} ${REQUIRED_GOALS[key].unit}`;
}

function displayGoal(goal: PostDTO["goals"][number]): string {
  if (goal.kind === "optional") {
    if (goal.value !== null) {
      return `${goal.name}: ${goal.value}`;
    }
    return `${goal.name}: ${goal.completed ? "complete" : "not complete"}`;
  }

  const label = REQUIRED_GOALS[goal.key].label;
  if (goal.key === "diet") {
    return `${label}: ${goal.met ? "yes" : "no"}`;
  }
  return `${label}: ${goal.amount ?? 0} ${goal.unit ?? ""}`.trim();
}

async function responseMessage(response: Response): Promise<string> {
  const payload = (await response
    .json()
    .catch(() => null)) as ApiFailure | null;
  return payload?.error?.message ?? "Something went wrong.";
}

export function PostCard({
  post,
  reactionPalette = DEFAULT_REACTION_PALETTE,
  onChanged,
  onDeleted,
}: PostCardProps) {
  const [reactionOpen, setReactionOpen] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentOperationId, setCommentOperationId] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const reactionTriggerRef = useRef<HTMLButtonElement>(null);
  const reactionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reactionOpen) {
      return;
    }

    const firstItem =
      reactionMenuRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]',
      );
    firstItem?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !reactionMenuRef.current?.contains(target) &&
        !reactionTriggerRef.current?.contains(target)
      ) {
        setReactionOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setReactionOpen(false);
        reactionTriggerRef.current?.focus();
        return;
      }

      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
      }

      const items = Array.from(
        reactionMenuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]',
        ) ?? [],
      );
      const currentIndex = items.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      if (items.length === 0) {
        return;
      }

      event.preventDefault();
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (currentIndex +
                (event.key === "ArrowDown" ? 1 : -1) +
                items.length) %
              items.length;
      items[nextIndex]?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [reactionOpen]);

  const updateReaction = async (emoji: string | null) => {
    setReactionBusy(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/posts/${post.id}/reaction`, {
        method: emoji ? "PUT" : "DELETE",
        ...(emoji
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ emoji }),
            }
          : {}),
      });
      if (!response.ok) {
        throw new Error(await responseMessage(response));
      }
      setReactionOpen(false);
      onChanged();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to update reaction.",
      );
    } finally {
      setReactionBusy(false);
    }
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCommentError(null);
    const parsed = commentBodySchema.safeParse(commentBody);
    if (!parsed.success) {
      setCommentError("Comments must contain 1–256 characters.");
      return;
    }

    const nextOperationId = commentOperationId ?? createBrowserOperationId();
    setCommentOperationId(nextOperationId);
    setCommentBusy(true);
    try {
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-client-operation-id": nextOperationId,
        },
        body: JSON.stringify({ body: parsed.data }),
      });
      if (!response.ok) {
        throw new Error(await responseMessage(response));
      }
      setCommentBody("");
      setCommentOperationId(null);
      onChanged();
    } catch (error) {
      setCommentError(
        error instanceof Error ? error.message : "Unable to add comment.",
      );
    } finally {
      setCommentBusy(false);
    }
  };

  const removeComment = async (commentId: string) => {
    setActionError(null);
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await responseMessage(response));
      }
      onChanged();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to delete comment.",
      );
    }
  };

  const removePost = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this post and remove its scoring entries?")
    ) {
      return;
    }

    setActionError(null);
    try {
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await responseMessage(response));
      }
      onDeleted();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to delete post.",
      );
    }
  };

  const reactedEmoji =
    post.reactions.find((reaction) => reaction.reactedByViewer)?.emoji ?? null;
  const dayNumber = getDayNumber(post.localDate, COHORT_START_DATE);

  return (
    <>
      <Card className="space-y-4" data-testid="post-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {post.author.avatarUrl ? (
              <img
                alt=""
                className="size-11 rounded-full object-cover"
                src={post.author.avatarUrl}
              />
            ) : (
              <span
                aria-hidden="true"
                className="bg-surface-accent text-primary flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
              >
                {post.author.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <Link
                className="text-primary block truncate text-sm font-semibold hover:underline"
                href={`/person/${post.author.id}`}
              >
                {post.author.displayName}
              </Link>
              <p className="text-muted text-xs">
                <time dateTime={post.createdAt}>
                  {displayTimestamp(post.createdAt)}
                </time>{" "}
                · <time dateTime={post.localDate}>{post.localDate}</time> · Day{" "}
                {dayNumber}
              </p>
            </div>
          </div>
          {post.canDelete ? (
            <Button
              aria-label={`Delete post by ${post.author.displayName}`}
              className="shrink-0 px-3"
              onClick={removePost}
              variant="ghost"
            >
              Delete
            </Button>
          ) : null}
        </div>

        <ul className="flex flex-wrap gap-2" aria-label="Required results">
          {REQUIRED_GOAL_KEYS.map((key) => (
            <li
              className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"
              key={`required-${key}`}
            >
              ✓ {displayRequiredGoal(key, post.requiredSnapshot)}
            </li>
          ))}
        </ul>

        {post.goals.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Selected optional goals">
            {post.goals.map((goal) => (
              <li
                className="bg-surface-accent text-primary rounded-full px-3 py-1 text-xs font-semibold"
                key={
                  goal.kind === "required"
                    ? `required-${goal.key}`
                    : `optional-${goal.optionalGoalId}`
                }
              >
                {displayGoal(goal)}
              </li>
            ))}
          </ul>
        ) : null}

        {post.note ? (
          <p className="text-foreground text-sm leading-6 break-words whitespace-pre-wrap">
            {post.note}
          </p>
        ) : null}

        {post.photoUrl ? (
          <button
            aria-label={`Open photo from ${post.author.displayName}`}
            className="focus-visible:ring-primary block w-full overflow-hidden rounded-2xl focus-visible:ring-2"
            onClick={() => setLightboxOpen(true)}
            type="button"
          >
            <img
              alt={`Post by ${post.author.displayName}`}
              className="max-h-[28rem] w-full object-cover"
              loading="lazy"
              src={post.photoUrl}
            />
          </button>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Button
              aria-expanded={reactionOpen}
              aria-haspopup="menu"
              disabled={reactionBusy}
              onClick={() => setReactionOpen((open) => !open)}
              ref={reactionTriggerRef}
              variant={reactedEmoji ? "secondary" : "ghost"}
            >
              {reactedEmoji ? `${reactedEmoji} Reacted` : "React"}
            </Button>
            {reactionOpen ? (
              <div
                aria-label="Reaction palette"
                className="border-border bg-card absolute bottom-full left-0 z-10 mb-2 flex max-w-[calc(100vw-2rem)] flex-wrap gap-1 rounded-2xl border p-2 shadow-lg"
                role="menu"
                ref={reactionMenuRef}
              >
                {reactionPalette.map((emoji) => (
                  <button
                    aria-label={`React ${emoji}`}
                    className={`hover:bg-surface-accent min-h-11 min-w-11 rounded-xl text-xl ${
                      emoji === reactedEmoji ? "bg-surface-accent" : ""
                    }`}
                    disabled={reactionBusy}
                    key={emoji}
                    onClick={() => updateReaction(emoji)}
                    role="menuitem"
                    type="button"
                  >
                    {emoji}
                  </button>
                ))}
                {reactedEmoji ? (
                  <button
                    className="text-muted hover:bg-surface-accent min-h-11 rounded-xl px-3 text-xs font-semibold"
                    disabled={reactionBusy}
                    onClick={() => updateReaction(null)}
                    role="menuitem"
                    type="button"
                  >
                    Remove reaction
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {post.reactions.map((reaction) => (
            <span
              className="text-muted rounded-full border border-transparent px-2 py-1 text-xs"
              key={reaction.emoji}
            >
              {reaction.emoji} {reaction.count}
            </span>
          ))}
        </div>

        <div className="border-border space-y-3 border-t pt-3">
          {post.comments.length > 0 ? (
            <ul className="space-y-3" aria-label="Comments">
              {post.comments.map((comment) => (
                <li
                  className="flex items-start justify-between gap-3"
                  key={comment.id}
                >
                  <p className="min-w-0 text-sm leading-5">
                    <Link
                      className="text-primary mr-1 font-semibold hover:underline"
                      href={`/person/${comment.author.id}`}
                    >
                      {comment.author.displayName}
                    </Link>
                    <span>{comment.body}</span>
                  </p>
                  {comment.canDelete ? (
                    <button
                      className="text-muted hover:bg-surface-accent min-h-11 shrink-0 rounded-lg px-2 text-xs"
                      onClick={() => removeComment(comment.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm">No comments yet.</p>
          )}
          <p className="text-muted text-xs">
            {post.comments.length}{" "}
            {post.comments.length === 1 ? "comment" : "comments"}
          </p>
          <form className="flex items-start gap-2" onSubmit={submitComment}>
            <label className="sr-only" htmlFor={`comment-${post.id}`}>
              Add a comment
            </label>
            <Input
              aria-describedby={`comment-count-${post.id}`}
              id={`comment-${post.id}`}
              maxLength={256}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Add a comment…"
              value={commentBody}
            />
            <Button disabled={commentBusy} type="submit">
              {commentBusy ? "…" : "Send"}
            </Button>
          </form>
          <p className="text-muted text-xs" id={`comment-count-${post.id}`}>
            {graphemeLength(commentBody)}/256 characters
          </p>
          {commentError ? (
            <p className="text-sm text-red-700" role="alert">
              {commentError}
            </p>
          ) : null}
        </div>

        {actionError ? (
          <p
            aria-live="assertive"
            className="text-sm text-red-700"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}
      </Card>
      <Lightbox
        alt={`Post by ${post.author.displayName}`}
        onClose={() => setLightboxOpen(false)}
        open={lightboxOpen}
        src={post.photoUrl}
      />
    </>
  );
}
