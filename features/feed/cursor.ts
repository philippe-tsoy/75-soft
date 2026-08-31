import { HttpError } from "@/lib/http";

import type { FeedCursor } from "./types";

const DEFAULT_FEED_LIMIT = 20;
const MAX_FEED_LIMIT = 50;
const CURSOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function isCursorId(value: unknown): value is string {
  return typeof value === "string" && CURSOR_ID_PATTERN.test(value);
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function encodeFeedCursor(cursor: FeedCursor): string {
  return encodeBase64Url(JSON.stringify(cursor));
}

export function decodeFeedCursor(value: string | null): FeedCursor | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(value));
    if (!parsed || typeof parsed !== "object") {
      throw new Error("cursor is not an object");
    }

    const candidate = parsed as {
      createdAt?: unknown;
      id?: unknown;
    };

    if (
      typeof candidate.createdAt !== "string" ||
      Number.isNaN(new Date(candidate.createdAt).valueOf()) ||
      !isCursorId(candidate.id)
    ) {
      throw new Error("cursor has an invalid shape");
    }

    return {
      createdAt: new Date(candidate.createdAt).toISOString(),
      id: candidate.id,
    };
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid feed cursor");
  }
}

export function parseFeedLimit(value: string | null): number {
  if (value === null || value === "") {
    return DEFAULT_FEED_LIMIT;
  }

  if (!/^\d+$/.test(value)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Feed limit must be a number");
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Feed limit must be at least 1",
    );
  }

  return Math.min(parsed, MAX_FEED_LIMIT);
}

export const FEED_DEFAULT_LIMIT = DEFAULT_FEED_LIMIT;
export const FEED_MAX_LIMIT = MAX_FEED_LIMIT;
