import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

export function invalidateDayTracking(
  queryClient: QueryClient,
  userId: string,
  localDate: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.day(userId, localDate),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.today(userId, localDate),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.groupStrip(localDate),
  });
  void queryClient.invalidateQueries({ queryKey: ["board"] });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.person(userId),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.achievements(userId),
  });
}

export function invalidateContainerTracking(
  queryClient: QueryClient,
  userId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.containers(userId),
  });
}

/**
 * Post creation/deletion and admin invalidation use the same day read key.
 * W3/W4 can call these helpers after their mutation succeeds; the SQL rollup
 * automatically excludes pending, failed, and deleted post rows.
 */
export const dayTrackingInvalidationContract = {
  amountOrDiet: ["day", "group-strip", "board", "person", "achievements"],
  postMutation: [
    "day",
    "group-strip",
    "board",
    "person",
    "feed",
    "post",
    "achievements",
  ],
  adminInvalidation: ["day", "group-strip", "board", "person", "achievements"],
} as const;
