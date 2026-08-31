"use client";

import { useEffect, useState } from "react";

import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/components/ui";
import {
  DEFAULT_REACTION_PALETTE,
  MAX_REACTION_PALETTE_ENTRIES,
} from "@/lib/config/75-soft";
import { isSingleEmoji } from "@/lib/validation";

async function readPalette(response: Response): Promise<string[]> {
  const body = (await response.json().catch(() => null)) as {
    data?: { emoji?: string[] };
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(body?.error?.message ?? "Unable to load reaction palette.");
  }

  return body?.data?.emoji ?? [...DEFAULT_REACTION_PALETTE];
}

export function ReactionPaletteEditor() {
  const [palette, setPalette] = useState<string[]>([
    ...DEFAULT_REACTION_PALETTE,
  ]);
  const [newEmoji, setNewEmoji] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/profile/reactions")
      .then(readPalette)
      .then((nextPalette) => {
        if (!cancelled) {
          setPalette(nextPalette);
          setBusy(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBusy(false);
          setError(true);
          setMessage("Using the default palette until settings are available.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function addEmoji() {
    const emoji = newEmoji.trim();
    if (!isSingleEmoji(emoji)) {
      setError(true);
      setMessage("Enter one emoji.");
      return;
    }
    if (palette.includes(emoji)) {
      setError(true);
      setMessage("That emoji is already in your palette.");
      return;
    }
    if (palette.length >= MAX_REACTION_PALETTE_ENTRIES) {
      setError(true);
      setMessage(
        `You can save up to ${MAX_REACTION_PALETTE_ENTRIES} reactions.`,
      );
      return;
    }

    setPalette((current) => [...current, emoji]);
    setNewEmoji("");
    setError(false);
    setMessage(null);
  }

  function removeEmoji(emoji: string) {
    if (palette.length === 1) {
      setError(true);
      setMessage("Keep at least one reaction available.");
      return;
    }
    setPalette((current) => current.filter((entry) => entry !== emoji));
    setError(false);
    setMessage(null);
  }

  function moveEmoji(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= palette.length) {
      return;
    }
    setPalette((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setError(false);
    setMessage(null);
  }

  async function savePalette() {
    setBusy(true);
    setError(false);
    setMessage(null);
    try {
      const response = await fetch("/api/profile/reactions", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emoji: palette }),
      });
      const savedPalette = await readPalette(response);
      setPalette(savedPalette);
      setMessage("Reaction palette saved.");
    } catch (saveError) {
      setError(true);
      setMessage(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save reaction palette.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="reaction-palette-title">
      <CardHeader>
        <CardTitle id="reaction-palette-title">Reaction palette</CardTitle>
        <p className="text-muted text-sm">
          Choose the reactions you want to use in the feed.
        </p>
      </CardHeader>

      <div
        className="flex flex-wrap gap-2"
        role="list"
        aria-label="Your reactions"
      >
        {palette.map((emoji, index) => (
          <div
            className="border-border flex items-center gap-1 rounded-xl border p-1"
            key={emoji}
            role="listitem"
          >
            <span
              aria-label={`Reaction ${emoji}`}
              className="px-2 text-xl"
              role="img"
            >
              {emoji}
            </span>
            <Button
              aria-label={`Move ${emoji} left`}
              disabled={busy || index === 0}
              onClick={() => moveEmoji(index, -1)}
              variant="ghost"
            >
              ←
            </Button>
            <Button
              aria-label={`Move ${emoji} right`}
              disabled={busy || index === palette.length - 1}
              onClick={() => moveEmoji(index, 1)}
              variant="ghost"
            >
              →
            </Button>
            <Button
              aria-label={`Remove ${emoji}`}
              disabled={busy || palette.length === 1}
              onClick={() => removeEmoji(emoji)}
              variant="ghost"
            >
              ×
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="min-w-44 flex-1 space-y-2">
          <Label htmlFor="new-reaction">Add an emoji</Label>
          <Input
            aria-describedby="reaction-palette-help"
            disabled={busy}
            id="new-reaction"
            maxLength={8}
            onChange={(event) => setNewEmoji(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addEmoji();
              }
            }}
            placeholder="✨"
            value={newEmoji}
          />
        </div>
        <Button
          className="self-end"
          disabled={busy}
          onClick={addEmoji}
          variant="secondary"
        >
          Add
        </Button>
      </div>
      <p className="text-muted mt-2 text-xs" id="reaction-palette-help">
        One emoji per reaction, up to {MAX_REACTION_PALETTE_ENTRIES}.
      </p>

      {message ? (
        <p
          aria-live={error ? "assertive" : "polite"}
          className={`mt-3 text-sm ${error ? "text-red-700" : "text-muted"}`}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
      <Button
        className="mt-4 w-full"
        disabled={busy}
        onClick={() => void savePalette()}
      >
        {busy ? "Loading…" : "Save palette"}
      </Button>
    </Card>
  );
}
