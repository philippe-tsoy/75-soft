import { FeedScreen } from "@/components/feed";
import { requireActiveMember } from "@/lib/auth/access";
import { createFeedClient, listOwnedOptionalGoals } from "@/features/feed";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const access = await requireActiveMember();
  const [optionalGoalsResult] = await Promise.allSettled([
    listOwnedOptionalGoals(await createFeedClient(), access.user.id),
  ]);

  const optionalGoals =
    optionalGoalsResult.status === "fulfilled" ? optionalGoalsResult.value : [];

  return (
    <FeedScreen
      optionalGoals={optionalGoals}
      optionalGoalsUnavailable={optionalGoalsResult.status === "rejected"}
    />
  );
}
