import { handleRouteError, HttpError, ok } from "@/lib/http";
import { requireActiveMember } from "@/lib/auth/access";
import { isoDateSchema } from "@/lib/validation";

import { createDayTrackingServices } from "@/features/day-tracking";

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

export async function GET(_request: Request, { params }: DayRouteContext) {
  try {
    const access = await requireActiveMember();
    const { localDate: rawLocalDate } = await params;
    const localDate = parseLocalDate(rawLocalDate);
    const { reads } = await createDayTrackingServices();
    const day = await reads.getDayRollup(access.user.id, localDate);

    return ok(day);
  } catch (error) {
    return handleRouteError(error);
  }
}
