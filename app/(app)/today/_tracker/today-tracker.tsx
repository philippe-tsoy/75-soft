import { requireActiveMember } from "@/lib/auth/access";

import { DayTracker } from "@/components/day/day-tracker";
import { createDayTrackingServices } from "@/features/day-tracking";
import { listGoalRows } from "@/features/goals/database";
import { getCurrentAmountInputMode } from "@/features/profiles/service";

export interface TodayTrackerServerProps {
  localDate: string;
  today: string;
}

/**
 * Server-side loader for Today and Yesterday. The caller supplies the
 * server-derived local dates; the client component receives only DTOs.
 */
export async function TodayTracker({
  localDate,
  today,
}: TodayTrackerServerProps) {
  const access = await requireActiveMember();
  const { containers, reads } = await createDayTrackingServices();
  const [day, savedContainers, amountInputMode, goalRows] = await Promise.all([
    reads.getDayRollup(access.user.id, localDate),
    containers.listContainers(access.user.id),
    getCurrentAmountInputMode(),
    listGoalRows(access.user.id),
  ]);

  return (
    <DayTracker
      amountInputMode={amountInputMode}
      hasAnyGoals={goalRows.length > 0}
      initialContainers={savedContainers}
      initialDay={day}
      today={today}
      userId={access.user.id}
    />
  );
}
