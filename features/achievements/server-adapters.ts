import "server-only";

import type { AchievementDTO } from "@/lib/types";
import type { FeedScoringAdapter } from "@/features/feed/types";

import {
  createAchievementClient,
  getAchievementResponse,
  type AchievementClient,
} from "@/features/achievements/database";

export interface AchievementDayActionAdapter {
  afterDayAction(input: {
    userId: string;
    localDate: string;
  }): Promise<AchievementDTO[]>;
}

export function createAchievementDayActionAdapter(
  client: AchievementClient,
): AchievementDayActionAdapter {
  return {
    async afterDayAction({ userId }) {
      const result = await getAchievementResponse(userId, client);
      return result.newlyUnlocked;
    },
  };
}

export async function evaluateDayActionAchievements(input: {
  userId: string;
  localDate: string;
}): Promise<AchievementDTO[]> {
  const client = await createAchievementClient();
  return createAchievementDayActionAdapter(client).afterDayAction(input);
}

/**
 * W3 can compose this hook with its existing scoring adapter. The hook returns
 * all rows inserted by the evaluator; callers render only the response toast.
 */
export function createAchievementFeedAdapter(
  client: AchievementClient,
): Pick<FeedScoringAdapter, "afterPostPublished" | "afterPostDeleted"> {
  return {
    async afterPostPublished({ userId }) {
      const result = await getAchievementResponse(userId, client);
      return result.newlyUnlocked;
    },
    async afterPostDeleted() {
      // Unlocks are monotonic. Deleting a post cannot revoke an existing badge.
    },
  };
}
