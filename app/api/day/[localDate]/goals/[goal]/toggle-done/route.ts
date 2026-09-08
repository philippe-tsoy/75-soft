import { requireActiveMember } from "@/lib/auth/access";
import { handleRouteError, HttpError, ok } from "@/lib/http";
import { isoDateSchema } from "@/lib/validation";

import { createDayTrackingServices } from "@/features/day-tracking";
import { evaluateDayActionAchievements } from "@/features/achievements/server-adapters";
import {
  parseAndResolveGoalDoneToggle,
  parseGoalIdPathSegment,
  readJsonBody,
} from "@/features/day-tracking/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DayGoalRouteContext {
  params: Promise<{ localDate: string; goal: string }>;
}

function parseLocalDate(value: string): string {
  const parsed = isoDateSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "localDate must be a valid YYYY-MM-DD date",
    );
  }

  return parsed.data;
}

export async function POST(request: Request, { params }: DayGoalRouteContext) {
  try {
    const access = await requireActiveMember();
    const { localDate: rawLocalDate, goal: rawGoal } = await params;
    const localDate = parseLocalDate(rawLocalDate);
    const goalId = parseGoalIdPathSegment(rawGoal);
    const body = await readJsonBody(request);
    const input = parseAndResolveGoalDoneToggle(body, request, goalId);
    const { mutations, reads } = await createDayTrackingServices();
    const mutation = await mutations.toggleGoalDone(
      access.user.id,
      localDate,
      input,
    );
    const day = await reads.getDayRollup(access.user.id, localDate);
    const newAchievements = await evaluateDayActionAchievements({
      userId: access.user.id,
      localDate,
    }).catch((error: unknown) => {
      console.error("Achievement evaluation failed after goal toggle", error);
      return [];
    });

    return ok(
      {
        day,
        deltaId: mutation.deltaId,
        newAchievements,
      },
      mutation.idempotent ? 200 : 201,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
