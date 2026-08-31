"use client";

import { ErrorState, LoadingState } from "@/components/feedback";
import { useAchievements } from "@/features/achievements/query";

import { AchievementList } from "./achievement-list";

export function AchievementPanel({ userId = "me" }: { userId?: string }) {
  const achievements = useAchievements(userId);

  if (achievements.isPending) {
    return <LoadingState label="Loading achievements…" />;
  }

  if (achievements.isError) {
    return (
      <ErrorState
        message="Your achievements could not be loaded."
        onRetry={() => void achievements.refetch()}
      />
    );
  }

  return <AchievementList achievements={achievements.data.achievements} />;
}
