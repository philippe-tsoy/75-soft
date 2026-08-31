import { TodayTracker } from "../today/_tracker/today-tracker";
import { getCurrentProfile } from "@/features/profiles/service";
import { getMemberLocalDate, getYesterday } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function YesterdayPage() {
  const profile = await getCurrentProfile();
  const today = getMemberLocalDate(new Date(), profile.timezone ?? "UTC");

  return <TodayTracker localDate={getYesterday(today)} today={today} />;
}
