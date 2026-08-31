import type { GoalDotState } from "@/lib/types";

export const cohortStartDate = "2026-09-01";

export const emptyGoalStates: GoalDotState = {
  workout: false,
  water: false,
  reading: false,
  diet: false,
};

export const threeMetGoalStates: GoalDotState = {
  workout: true,
  water: true,
  reading: true,
  diet: false,
};

export const allMetGoalStates: GoalDotState = {
  workout: true,
  water: true,
  reading: true,
  diet: true,
};

export const fixtureUsers = {
  admin: {
    id: "00000000-0000-0000-0000-000000000001",
    displayName: "Admin",
    timezone: "America/New_York",
  },
  memberA: {
    id: "00000000-0000-0000-0000-000000000002",
    displayName: "Member A",
    timezone: "America/Los_Angeles",
  },
  memberB: {
    id: "00000000-0000-0000-0000-000000000003",
    displayName: "Member B",
    timezone: "Asia/Tokyo",
  },
  removedMember: {
    id: "00000000-0000-0000-0000-000000000004",
    displayName: "Removed Member",
    timezone: "Europe/London",
  },
} as const;

export const representativeTimezones = [
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Tokyo",
] as const;

export const sourceEventFixtures = {
  quietWorkout: {
    localDate: "2026-09-01",
    amountInt: 45,
    source: "quiet",
  },
  publishedPost: {
    localDate: "2026-09-01",
    status: "published",
    workoutMinutes: 30,
    waterMl: 1_000,
  },
  deletedPost: {
    localDate: "2026-09-01",
    status: "deleted",
    waterMl: 500,
  },
  pendingPost: {
    localDate: "2026-09-01",
    status: "pending",
    readingPages: 10,
  },
  dietEvents: [true, false, true],
} as const;

export const invalidatedDateFixture = {
  userId: fixtureUsers.memberA.id,
  localDate: "2026-09-01",
  invalidated: true,
} as const;

export const goldenScoringFixtures = {
  firstCohortDay: {
    localDate: "2026-09-01",
    dayNumber: 1,
  },
  threeMetToday: {
    localDate: "2026-09-01",
    goalsAchievedToday: 3,
  },
  fourMetToday: {
    localDate: "2026-09-01",
    goalsAchievedToday: 4,
  },
  lateJoiner: {
    joinLocalDate: "2026-09-04",
    preJoinDate: "2026-09-03",
    firstEligibleDate: "2026-09-04",
  },
  localMidnight: {
    previousDate: "2026-09-01",
    nextDate: "2026-09-02",
    nextDateScore: 0,
  },
} as const;
