import { FeedScreen } from "@/components/feed";
import { requireActiveMember } from "@/lib/auth/access";
import { getMemberLocalDate } from "@/lib/dates";
import { createFeedClient, listOwnedGoals } from "@/features/feed";
import { getCurrentProfile } from "@/features/profiles/service";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const access = await requireActiveMember();
  const [profile, client] = await Promise.all([
    getCurrentProfile(),
    createFeedClient(),
  ]);
  const today = getMemberLocalDate(new Date(), profile.timezone ?? "UTC");
  const [goalsResult] = await Promise.allSettled([
    listOwnedGoals(client, access.user.id),
  ]);

  const goals = goalsResult.status === "fulfilled" ? goalsResult.value : [];

  return (
    <FeedScreen
      goals={goals}
      goalsUnavailable={goalsResult.status === "rejected"}
      today={today}
      userId={access.user.id}
    />
  );
}
