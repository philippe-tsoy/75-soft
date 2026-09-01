import { getMemberLocalDate } from "@/lib/dates";
import {
  handleRouteError,
  HttpError,
  ok,
  requireActiveMember,
} from "@/lib/http";
import type { DayRollupDTO } from "@/lib/types";

import {
  createFeedClient,
  createFeedScoringAdapter,
  createPost,
  getMemberProfile,
  parsePostForm,
  resolvePostLocalDate,
} from "@/features/feed";
import { createAchievementFeedAdapter } from "@/features/achievements/server-adapters";
import type { AchievementClient } from "@/features/achievements/database";
import { getMyTeam } from "@/features/teams/database";

// A frozen, display-only recap of that date's rollup at publish time -- never
// summed into scoring. See TEAMS_PERCENTAGE_AND_DAILY_PHOTO.md §4.4.
function buildRequiredSnapshot(day: DayRollupDTO): Record<string, unknown> {
  return {
    workout: { amount: day.goals.workout.amount ?? 0, met: day.goals.workout.met },
    water: { amount: day.goals.water.amount ?? 0, met: day.goals.water.met },
    reading: { amount: day.goals.reading.amount ?? 0, met: day.goals.reading.met },
    diet: { met: day.goals.diet.met },
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await requireActiveMember();
    const client = await createFeedClient();
    const profile = await getMemberProfile(client, access.user.id);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "The multipart post body could not be read",
      );
    }

    const parsed = parsePostForm(request, formData);
    const memberLocalDate = getMemberLocalDate(new Date(), profile.timezone);
    const localDate = resolvePostLocalDate(
      parsed.localDate,
      memberLocalDate,
      access.membership.joinLocalDate,
    );
    const scoring = {
      ...createFeedScoringAdapter(client),
      ...createAchievementFeedAdapter(client as unknown as AchievementClient),
    };
    const existingDay = await scoring.getDayRollup(access.user.id, localDate);
    if (existingDay?.invalidated) {
      throw new HttpError(
        422,
        "BUSINESS_RULE_VIOLATION",
        "This date has been invalidated",
        { localDate },
      );
    }

    if (!existingDay || existingDay.metCount < 4) {
      throw new HttpError(
        422,
        "BUSINESS_RULE_VIOLATION",
        "Finish today's required goals before posting",
        { localDate, metCount: existingDay?.metCount ?? 0 },
      );
    }

    const myTeam = await getMyTeam(access.user.id);

    const result = await createPost({
      client,
      authorId: access.user.id,
      viewerIsAdmin: access.membership.role === "admin",
      cohortId: access.membership.cohortId,
      localDate,
      goals: parsed.goals,
      note: parsed.note,
      photo: parsed.photo,
      requiredSnapshot: buildRequiredSnapshot(existingDay),
      teamId: myTeam?.teamId ?? null,
      clientOperationId: parsed.clientOperationId,
      scoring,
    });

    return ok(
      {
        post: result.post,
        day: result.day,
        newAchievements: result.newAchievements,
      },
      result.idempotent ? 200 : 201,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
