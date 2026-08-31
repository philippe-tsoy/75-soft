import type {
  AchievementDTO,
  CalendarCellDTO,
  DayRollupDTO,
  PostDTO,
  RequiredGoalKey,
} from "@/lib/types";

export const ACHIEVEMENT_CODES = [
  "FIRST_UPDATE",
  "FIRST_FULL_DAY",
  "FIRST_PHOTO",
  "DAY_75",
  "THREE_POSTS_ONE_DAY",
  "WATER_BEFORE_NOON",
  "FULL_DAY_AFTER_MISS",
  "WORKOUT_READING_ONE_POST",
  "SEVEN_PHOTOS",
  "WATER_EXACT_TARGET",
] as const;

export type AchievementCode = (typeof ACHIEVEMENT_CODES)[number];

export type AchievementAction =
  "load" | "quiet_log" | "post_update" | "photo_update";

export interface AchievementDefinition {
  code: AchievementCode;
  title: string;
  description: string;
  isHidden: boolean;
  priority: number;
}

export interface AchievementToastDTO {
  code: AchievementCode;
  title: string;
  description: string;
}

export interface AchievementResponseDTO {
  achievements: AchievementDTO[];
  newlyUnlocked: AchievementDTO[];
  toast: AchievementToastDTO | null;
}

/**
 * This is the only source shape the evaluator needs from W2/W3.
 * It deliberately contains derived/public facts instead of database rows.
 */
export interface AchievementPostEvidence {
  id: string;
  localDate: string;
  createdAt: string;
  hasPhoto: boolean;
  requiredGoals: readonly RequiredGoalKey[];
  invalidated?: boolean;
}

export interface AchievementWaterEvent {
  id: string;
  localDate: string;
  createdAt: string;
  amountMl: number;
  /**
   * W2/W3 adapters provide the member-local hour so achievement evaluation
   * does not introduce a second timezone implementation.
   */
  localHour: number;
  invalidated?: boolean;
}

export interface AchievementDayEvidence {
  localDate: string;
  dayNumber: number;
  status: DayRollupDTO["status"];
  metCount: number;
  invalidated: boolean;
}

export interface AchievementEvidence {
  activeMember: boolean;
  currentLocalDate: string;
  currentDayNumber: number;
  posts: readonly AchievementPostEvidence[];
  waterEvents: readonly AchievementWaterEvent[];
  days: readonly AchievementDayEvidence[];
}

export interface AchievementDayAdapter {
  getCalendar(
    userId: string,
    fromDate: string,
    toDate: string,
  ): Promise<CalendarCellDTO[]>;
}

/**
 * W3 supplies this narrow projection rather than exposing its post tables to
 * the achievement feature.
 */
export interface AchievementPostAdapter {
  listPublishedAchievementEvidence(
    userId: string,
  ): Promise<readonly AchievementPostEvidence[]>;
  listPublishedWaterEvents(
    userId: string,
  ): Promise<readonly AchievementWaterEvent[]>;
}

export interface AchievementEvidenceAdapter {
  getEvidence(userId: string): Promise<AchievementEvidence>;
}

export type AchievementUnlockDTO = AchievementDTO & {
  code: AchievementCode;
  unlockedAt: string;
};

export type AchievementPostProjection = Pick<
  PostDTO,
  "id" | "localDate" | "createdAt" | "goals" | "photoUrl"
>;
