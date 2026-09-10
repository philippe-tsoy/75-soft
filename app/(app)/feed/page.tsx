import { FeedScreen } from "@/components/feed";
import { requireActiveMember } from "@/lib/auth/access";
import { getMemberLocalDate } from "@/lib/dates";
import { getCurrentProfile } from "@/features/profiles/service";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const access = await requireActiveMember();
  const profile = await getCurrentProfile();
  const today = getMemberLocalDate(new Date(), profile.timezone ?? "UTC");

  return <FeedScreen today={today} userId={access.user.id} />;
}
