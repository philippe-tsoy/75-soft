import { requireActiveMember } from "@/lib/auth/access";

import { DayTracker } from "@/components/day/day-tracker";
import { createDayTrackingServices } from "@/features/day-tracking";

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
  const [day, savedContainers] = await Promise.all([
    reads.getDayRollup(access.user.id, localDate),
    containers.listContainers(access.user.id),
  ]);

  return (
    <DayTracker
      initialContainers={savedContainers}
      initialDay={day}
      today={today}
      userId={access.user.id}
    />
  );
}
