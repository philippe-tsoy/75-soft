import { FeedScreen } from "@/components/feed";
import { requireActiveMember } from "@/lib/auth/access";
import { getMemberLocalDate } from "@/lib/dates";
import { createFeedClient, listOwnedOptionalGoals } from "@/features/feed";
import { getCurrentProfile } from "@/features/profiles/service";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const access = await requireActiveMember();
  const [profile, client] = await Promise.all([
    getCurrentProfile(),
    createFeedClient(),
  ]);
  const today = getMemberLocalDate(new Date(), profile.timezone ?? "UTC");
  const [optionalGoalsResult] = await Promise.allSettled([
    listOwnedOptionalGoals(client, access.user.id),
  ]);

  const optionalGoals =
    optionalGoalsResult.status === "fulfilled" ? optionalGoalsResult.value : [];

  return (
    <FeedScreen
      optionalGoals={optionalGoals}
      optionalGoalsUnavailable={optionalGoalsResult.status === "rejected"}
      today={today}
      userId={access.user.id}
    />
  );
}
