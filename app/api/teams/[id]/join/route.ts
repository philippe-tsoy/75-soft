import { requireActiveMember } from "@/lib/auth/access";
import { handleRouteError, HttpError, ok } from "@/lib/http";
import { operationIdSchema } from "@/lib/validation";

import { getMyTeam, joinTeam } from "@/features/teams/database";

export const dynamic = "force-dynamic";

interface JoinRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: JoinRouteContext) {
  try {
    const access = await requireActiveMember();
    const { id } = await params;
    const parsed = operationIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_ERROR", "Team id must be a UUID");
    }

    await joinTeam(parsed.data);
    const myTeam = await getMyTeam(access.user.id);

    return ok(myTeam);
  } catch (error) {
    return handleRouteError(error);
  }
}
