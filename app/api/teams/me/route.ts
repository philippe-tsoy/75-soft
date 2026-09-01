import { requireActiveMember } from "@/lib/auth/access";
import { handleRouteError, ok } from "@/lib/http";

import { getMyTeam } from "@/features/teams/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await requireActiveMember();
    const myTeam = await getMyTeam(access.user.id);

    return ok(myTeam);
  } catch (error) {
    return handleRouteError(error);
  }
}
