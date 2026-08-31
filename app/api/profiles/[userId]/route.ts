import { z } from "zod";

import {
  handleRouteError,
  HttpError,
  ok,
  requireActiveMember,
  requireSession,
} from "@/lib/http";
import { ReadModelError } from "@/features/board/database";
import { getPersonSummary } from "@/features/person/database";

export const dynamic = "force-dynamic";

const userIdSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    if (!userIdSchema.safeParse(userId).success) {
      throw new HttpError(400, "VALIDATION_ERROR", "Invalid member id");
    }

    const session = await requireSession(request);
    const access = await requireActiveMember(session);
    const summary = await getPersonSummary(access.user.id, userId);

    if (!summary) {
      throw new HttpError(404, "NOT_FOUND", "Member not found");
    }

    return ok(summary);
  } catch (error) {
    if (error instanceof ReadModelError && error.code === "42501") {
      return handleRouteError(
        new HttpError(403, "FORBIDDEN", "This member view is unavailable"),
      );
    }

    return handleRouteError(error);
  }
}
