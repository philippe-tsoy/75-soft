import { z } from "zod";

import {
  handleRouteError,
  HttpError,
  ok,
  requireActiveMember,
} from "@/lib/http";
import { operationIdSchema } from "@/lib/validation";

import { getAchievementResponse } from "@/features/achievements/database";

export const dynamic = "force-dynamic";

const evaluateRequestSchema = z
  .object({
    action: z
      .enum(["load", "quiet_log", "post_update", "photo_update"])
      .optional(),
    clientOperationId: operationIdSchema.optional(),
  })
  .strict();

async function readEvaluateRequest(request: Request): Promise<void> {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Request body must be valid JSON",
    );
  }

  const result = evaluateRequestSchema.safeParse(parsed);
  if (!result.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Invalid achievement evaluation request",
      { issues: result.error.issues },
    );
  }
}

export async function GET() {
  try {
    const context = await requireActiveMember();
    const data = await getAchievementResponse(context.membership.userId);
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await readEvaluateRequest(request);
    const context = await requireActiveMember();
    const data = await getAchievementResponse(context.membership.userId);
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
