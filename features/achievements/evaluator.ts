// Not wired into production: the live evaluation path is the
// `evaluate_achievements` Postgres RPC (database/functions/achievement_evaluator.sql),
// called from features/achievements/database.ts. Keep the two rule sets in
// sync manually until one is deleted or this one is actually adopted.
import { getYesterday } from "@/lib/dates";
import { WATER_TARGET_ML } from "@/lib/config/75-soft";

import { ACHIEVEMENT_CATALOG } from "@/features/achievements/catalog";
import type {
  AchievementCode,
  AchievementDefinition,
  AchievementEvidence,
  AchievementWaterEvent,
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

function getValidWaterEvents(evidence: AchievementEvidence) {
  const invalidatedDates = getInvalidatedDates(evidence);

  return evidence.waterEvents.filter(
    (event) =>
      !event.invalidated &&
      event.localDate <= evidence.currentLocalDate &&
      !invalidatedDates.has(event.localDate),
  );
}

function hasFirstFullDay(evidence: AchievementEvidence): boolean {
  return evidence.days.some(
    (day) =>
      day.localDate <= evidence.currentLocalDate &&
      !day.invalidated &&
      day.status === "complete" &&
      day.metCount === 4,
  );
}

function hasThreePostsOnOneDay(evidence: AchievementEvidence): boolean {
  const counts = new Map<string, number>();

  for (const post of getValidPosts(evidence)) {
    counts.set(post.localDate, (counts.get(post.localDate) ?? 0) + 1);
  }

  return [...counts.values()].some((count) => count >= 3);
}

function hasWaterMilestoneBeforeNoon(evidence: AchievementEvidence): boolean {
  const eventsByDate = new Map<string, AchievementWaterEvent[]>();

  for (const event of getValidWaterEvents(evidence)) {
    const events = eventsByDate.get(event.localDate) ?? [];
    events.push(event);
    eventsByDate.set(event.localDate, events);
  }

  for (const events of eventsByDate.values()) {
    events.sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );

    let total = 0;
    for (const event of events) {
      total += event.amountMl;
      if (total >= WATER_TARGET_ML && event.localHour < 12) {
        return true;
      }
    }
  }

  return false;
}

function hasFullDayAfterMiss(evidence: AchievementEvidence): boolean {
  const daysByDate = new Map(evidence.days.map((day) => [day.localDate, day]));

  return evidence.days.some((day) => {
    if (
      day.localDate > evidence.currentLocalDate ||
      day.invalidated ||
      day.status !== "complete" ||
      day.metCount !== 4
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

function hasExactWaterRollup(evidence: AchievementEvidence): boolean {
  const eventsByDate = new Map<string, AchievementWaterEvent[]>();

  for (const event of getValidWaterEvents(evidence)) {
    const events = eventsByDate.get(event.localDate) ?? [];
    events.push(event);
    eventsByDate.set(event.localDate, events);
  }

  for (const events of eventsByDate.values()) {
    events.sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );

    let total = 0;
    for (const event of events) {
      total += event.amountMl;
      if (total === WATER_TARGET_ML) {
        return true;
      }
    }
  }

  return false;
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
    case "WATER_BEFORE_NOON":
      return hasWaterMilestoneBeforeNoon(evidence);
    case "FULL_DAY_AFTER_MISS":
      return hasFullDayAfterMiss(evidence);
    case "SEVEN_PHOTOS":
      return hasSevenPhotos(evidence);
    case "WATER_EXACT_TARGET":
      return hasExactWaterRollup(evidence);
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
