import { TodayGroupStrip } from "./_group-strip/group-strip";
import { TodayTracker } from "./_tracker/today-tracker";
import { getCurrentProfile } from "@/features/profiles/service";
import { getMemberLocalDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const profile = await getCurrentProfile();
  const today = getMemberLocalDate(new Date(), profile.timezone ?? "UTC");

  return (
    <div className="space-y-2">
      <TodayGroupStrip />
      <TodayTracker localDate={today} today={today} />
    </div>
  );
}
