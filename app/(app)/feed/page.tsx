import { FeedScreen } from "@/components/feed";
import { requireActiveMember } from "@/lib/auth/access";
import { createFeedClient, listOwnedOptionalGoals } from "@/features/feed";
import { createDayTrackingServices } from "@/features/day-tracking";
import type { ContainerDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const access = await requireActiveMember();
  const [optionalGoalsResult, containerResult] = await Promise.allSettled([
    listOwnedOptionalGoals(await createFeedClient(), access.user.id),
    (async (): Promise<ContainerDTO[]> => {
      const { containers } = await createDayTrackingServices();
      return containers.listContainers(access.user.id);
    })(),
  ]);

  const optionalGoals =
    optionalGoalsResult.status === "fulfilled" ? optionalGoalsResult.value : [];
  const containers =
    containerResult.status === "fulfilled" ? containerResult.value : [];

  return (
    <FeedScreen
      containers={containers}
      containersUnavailable={containerResult.status === "rejected"}
      optionalGoals={optionalGoals}
      optionalGoalsUnavailable={optionalGoalsResult.status === "rejected"}
    />
  );
}
