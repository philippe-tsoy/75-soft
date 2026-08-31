import { CalendarGrid } from "@/components/person/calendar-grid";
import { TodayActions } from "@/components/today/today-actions";
import { COHORT_START_DATE } from "@/lib/config/75-soft";
import { createDayTrackingServices } from "@/features/day-tracking";
import { requireActiveMember } from "@/lib/auth/access";
import { TodayGroupStrip } from "./_group-strip/group-strip";
import { TodayTracker } from "./_tracker/today-tracker";
import { getCurrentProfile } from "@/features/profiles/service";
import { getMemberLocalDate, getYesterday } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const access = await requireActiveMember();
  const profile = await getCurrentProfile();
  const today = getMemberLocalDate(new Date(), profile.timezone ?? "UTC");
  const allowYesterday = access.membership.joinLocalDate <= getYesterday(today);
  const { reads } = await createDayTrackingServices();
  const calendar =
    today >= COHORT_START_DATE
      ? await reads.getCalendar(profile.id, COHORT_START_DATE, today)
      : [];

  return (
    <div className="space-y-2">
      <TodayGroupStrip />
      <TodayTracker localDate={today} today={today} />
      <TodayActions
        allowYesterday={allowYesterday}
        localDate={today}
        userId={profile.id}
      />
      <CalendarGrid cells={calendar} />
    </div>
  );
}
