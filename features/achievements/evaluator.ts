// Not wired into production: the live evaluation path is the
// `evaluate_achievements` Postgres RPC (database/functions/achievement_evaluator.sql),
// called from features/achievements/database.ts. Keep the two rule sets in
// sync manually until one is deleted or this one is actually adopted.
import { getYesterday } from "@/lib/dates";

import { ACHIEVEMENT_CATALOG } from "@/features/achievements/catalog";
import type {
  AchievementCode,
  AchievementDefinition,
  AchievementEvidence,
} from "@/features/achievements/types";

export interface AchievementRuleEvaluation {
  newlyUnlocked: readonly AchievementDefinition[];
  toast: AchievementDefinition | null;
}

function getInvalidatedDates(evidence: AchievementEvidence): Set<string> {
  return new Set(
    evidence.days.filter((day) => day.invalidated).map((day) => day.localDate),
  );
}

function getValidPosts(evidence: AchievementEvidence) {
  const invalidatedDates = getInvalidatedDates(evidence);

  return evidence.posts.filter(
    (post) =>
      !post.invalidated &&
      post.localDate <= evidence.currentLocalDate &&
      !invalidatedDates.has(post.localDate),
  );
}

function hasFirstFullDay(evidence: AchievementEvidence): boolean {
  return evidence.days.some(
    (day) =>
      day.localDate <= evidence.currentLocalDate &&
      !day.invalidated &&
      day.status === "complete",
  );
}

function hasThreePostsOnOneDay(evidence: AchievementEvidence): boolean {
  const counts = new Map<string, number>();

  for (const post of getValidPosts(evidence)) {
    counts.set(post.localDate, (counts.get(post.localDate) ?? 0) + 1);
  }

  return [...counts.values()].some((count) => count >= 3);
}

function hasFullDayAfterMiss(evidence: AchievementEvidence): boolean {
  const daysByDate = new Map(evidence.days.map((day) => [day.localDate, day]));

  return evidence.days.some((day) => {
    if (
      day.localDate > evidence.currentLocalDate ||
      day.invalidated ||
      day.status !== "complete"
    ) {
      return false;
    }

    const previousDay = daysByDate.get(getYesterday(day.localDate));

    return (
      previousDay !== undefined &&
      previousDay.localDate < evidence.currentLocalDate &&
      !previousDay.invalidated &&
      previousDay.status === "missed" &&
      previousDay.metCount === 0
    );
  });
}

function hasSevenPhotos(evidence: AchievementEvidence): boolean {
  return getValidPosts(evidence).filter((post) => post.hasPhoto).length >= 7;
}

function isCandidate(
  code: AchievementCode,
  evidence: AchievementEvidence,
): boolean {
  if (!evidence.activeMember) {
    return false;
  }

  switch (code) {
    case "FIRST_UPDATE":
      return getValidPosts(evidence).length > 0;
    case "FIRST_FULL_DAY":
      return hasFirstFullDay(evidence);
    case "FIRST_PHOTO":
      return getValidPosts(evidence).some((post) => post.hasPhoto);
    case "DAY_75":
      return evidence.currentDayNumber >= 75;
    case "THREE_POSTS_ONE_DAY":
      return hasThreePostsOnOneDay(evidence);
    case "FULL_DAY_AFTER_MISS":
      return hasFullDayAfterMiss(evidence);
    case "SEVEN_PHOTOS":
      return hasSevenPhotos(evidence);
  }
}

export function getAchievementCandidates(
  evidence: AchievementEvidence,
): readonly AchievementDefinition[] {
  return ACHIEVEMENT_CATALOG.filter((definition) =>
    isCandidate(definition.code, evidence),
  ).sort((left, right) => left.priority - right.priority);
}

export function evaluateAchievementRules(
  evidence: AchievementEvidence,
  unlockedCodes: ReadonlySet<string> = new Set(),
): AchievementRuleEvaluation {
  const newlyUnlocked = getAchievementCandidates(evidence).filter(
    (definition) => !unlockedCodes.has(definition.code),
  );

  return {
    newlyUnlocked,
    toast: newlyUnlocked[0] ?? null,
  };
}

export function selectAchievementToast(
  definitions: readonly AchievementDefinition[],
): AchievementDefinition | null {
  return (
    [...definitions].sort((left, right) => left.priority - right.priority)[0] ??
    null
  );
}
