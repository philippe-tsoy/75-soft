import { FeedScreen } from "@/components/feed";
import { requireActiveMember } from "@/lib/auth/access";
import { createFeedClient, listOwnedOptionalGoals } from "@/features/feed";
import type { OptionalGoalDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  let optionalGoals: OptionalGoalDTO[] = [];

  try {
    const access = await requireActiveMember();
    const client = await createFeedClient();
    optionalGoals = await listOwnedOptionalGoals(client, access.user.id);
  } catch {
    // The protected app layout owns access redirects. An unavailable optional
    // goal table should not prevent the shared feed from rendering.
    optionalGoals = [];
  }

  return <FeedScreen optionalGoals={optionalGoals} />;
}
