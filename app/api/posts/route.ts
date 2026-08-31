import { getMemberLocalDate } from "@/lib/dates";
import {
  handleRouteError,
  HttpError,
  ok,
  requireActiveMember,
} from "@/lib/http";

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

    const result = await createPost({
      client,
      authorId: access.user.id,
      viewerIsAdmin: access.membership.role === "admin",
      cohortId: access.membership.cohortId,
      localDate,
      goals: parsed.goals,
      note: parsed.note,
      photo: parsed.photo,
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
