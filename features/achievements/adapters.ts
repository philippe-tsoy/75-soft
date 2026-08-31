import { COHORT_START_DATE } from "@/lib/config/75-soft";
import {
  getDayNumber,
  getMemberLocalDate,
  isScoredCalendarDate,
  type ISODate,
} from "@/lib/dates";
import type { DayTrackingReadService } from "@/features/day-tracking/types";

import type {
  AchievementDayAdapter,
  AchievementDayEvidence,
  AchievementEvidence,
  AchievementEvidenceAdapter,
  AchievementPostAdapter,
  AchievementPostEvidence,
  AchievementPostProjection,
} from "@/features/achievements/types";

export type W2AchievementDayAdapter = Pick<
  DayTrackingReadService,
  "getCalendar"
>;

export type W3AchievementPostAdapter = AchievementPostAdapter;

export interface AchievementMemberContext {
  activeMember: boolean;
  timezone: string;
  joinLocalDate: ISODate;
  cohortStartDate?: ISODate;
  nowInstant?: Date | string;
}

export interface AchievementMemberAdapter {
  getMemberContext(userId: string): Promise<AchievementMemberContext>;
}

function mapDayEvidence(
  days: Awaited<ReturnType<AchievementDayAdapter["getCalendar"]>>,
): AchievementDayEvidence[] {
  return days.map((day) => ({
    localDate: day.localDate,
    dayNumber: day.dayNumber,
    status: day.status,
    metCount: day.metCount,
    invalidated: day.invalidated,
  }));
}

export function toAchievementPostEvidence(
  post: AchievementPostProjection,
): AchievementPostEvidence {
  return {
    id: post.id,
    localDate: post.localDate,
    createdAt: post.createdAt,
    hasPhoto: post.photoUrl !== null,
    requiredGoals: post.goals
      .filter((goal) => goal.kind === "required")
      .map((goal) => goal.key),
  };
}

export async function collectAchievementEvidence(
  userId: string,
  member: AchievementMemberContext,
  dayAdapter: AchievementDayAdapter,
  postAdapter: AchievementPostAdapter,
): Promise<AchievementEvidence> {
  const cohortStartDate = member.cohortStartDate ?? COHORT_START_DATE;
  const currentLocalDate = getMemberLocalDate(
    member.nowInstant ?? new Date(),
    member.timezone,
  );
  const currentDayNumber = getDayNumber(currentLocalDate, cohortStartDate);

  if (
    !member.activeMember ||
    !isScoredCalendarDate(
      currentLocalDate,
      member.joinLocalDate,
      cohortStartDate,
    )
  ) {
    return {
      activeMember: member.activeMember,
      currentLocalDate,
      currentDayNumber,
      posts: [],
      waterEvents: [],
      days: [],
    };
  }

  const firstScoredDate =
    member.joinLocalDate > cohortStartDate
      ? member.joinLocalDate
      : cohortStartDate;
  const [days, posts, waterEvents] = await Promise.all([
    dayAdapter.getCalendar(userId, firstScoredDate, currentLocalDate),
    postAdapter.listPublishedAchievementEvidence(userId),
    postAdapter.listPublishedWaterEvents(userId),
  ]);

  return {
    activeMember: true,
    currentLocalDate,
    currentDayNumber,
    posts,
    waterEvents,
    days: mapDayEvidence(days),
  };
}

export function createAchievementEvidenceAdapter(
  memberAdapter: AchievementMemberAdapter,
  dayAdapter: AchievementDayAdapter,
  postAdapter: AchievementPostAdapter,
): AchievementEvidenceAdapter {
  return {
    async getEvidence(userId) {
      const member = await memberAdapter.getMemberContext(userId);
      return collectAchievementEvidence(
        userId,
        member,
        dayAdapter,
        postAdapter,
      );
    },
  };
}
