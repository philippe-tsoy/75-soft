import { requireActiveMember } from "@/lib/auth/access";
import { handleRouteError, HttpError, noContent } from "@/lib/http";
import { operationIdSchema } from "@/lib/validation";

import { leaveTeam } from "@/features/teams/database";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await requireActiveMember();
    const body = await request.json().catch(() => null);
    const rawUserId =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).userId
        : undefined;

    let targetUserId: string | null = null;
    if (typeof rawUserId === "string") {
      const parsed = operationIdSchema.safeParse(rawUserId);
      if (!parsed.success) {
        throw new HttpError(400, "VALIDATION_ERROR", "userId must be a UUID");
      }

      if (
        parsed.data !== access.user.id &&
        access.membership.role !== "admin"
      ) {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only an admin can remove another member from their team",
        );
      }

      targetUserId = parsed.data;
    }

    await leaveTeam(targetUserId);

    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
