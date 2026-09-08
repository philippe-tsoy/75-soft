import { TodayActions } from "@/components/today/today-actions";
import { requireActiveMember } from "@/lib/auth/access";
import { TodayTracker } from "./_tracker/today-tracker";
import { getCurrentProfile } from "@/features/profiles/service";
import { getMemberLocalDate, getYesterday } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const access = await requireActiveMember();
  const profile = await getCurrentProfile();
  const today = getMemberLocalDate(new Date(), profile.timezone ?? "UTC");
  const allowYesterday = access.membership.joinLocalDate <= getYesterday(today);

  return (
    <div className="space-y-4">
      <TodayTracker localDate={today} today={today} />
      <TodayActions
        allowYesterday={allowYesterday}
        localDate={today}
        userId={profile.id}
      />
    </div>
  );
}
