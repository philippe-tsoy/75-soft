import { requireActiveMember } from "@/lib/auth/access";
import { handleRouteError, HttpError, ok } from "@/lib/http";
import { isoDateSchema } from "@/lib/validation";

import { createDayTrackingServices } from "@/features/day-tracking";
import { evaluateDayActionAchievements } from "@/features/achievements/server-adapters";
import {
  parseDietToggleInput,
  readJsonBody,
  resolveClientOperationId,
} from "@/features/day-tracking/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DayRouteContext {
  params: Promise<{ localDate: string }>;
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

export async function POST(request: Request, { params }: DayRouteContext) {
  try {
    const access = await requireActiveMember();
    const { localDate: rawLocalDate } = await params;
    const localDate = parseLocalDate(rawLocalDate);
    const body = await readJsonBody(request);
    const parsed = parseDietToggleInput(body);
    const input = {
      clientOperationId: resolveClientOperationId(
        request,
        parsed.clientOperationId,
      ),
    };
    const { mutations, reads } = await createDayTrackingServices();
    const mutation = await mutations.toggleDiet(
      access.user.id,
      localDate,
      input,
    );
    const day = await reads.getDayRollup(access.user.id, localDate);
    const newAchievements = await evaluateDayActionAchievements({
      userId: access.user.id,
      localDate,
    }).catch((error: unknown) => {
      console.error("Achievement evaluation failed after diet toggle", error);
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
