import { fail, handleRouteError, ok } from "@/lib/http";

import {
  clearInviteIntentCookie,
  setInviteIntentCookie,
} from "@/features/auth/invite-intent";
import { createInviteIntent } from "@/features/auth/invite-service";
import {
  inviteCodeSchema,
  validationDetails,
} from "@/features/auth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail(400, "VALIDATION_ERROR", "Request body is invalid");
    }

    const parsed = inviteCodeSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "Invite code is invalid",
        validationDetails(parsed.error),
      );
    }

    const intent = await createInviteIntent(parsed.data.code);
    const response = ok(
      intent
        ? { valid: true, intentExpiresAt: intent.expiresAt }
        : { valid: false },
    );

    if (intent) {
      setInviteIntentCookie(response, intent.token);
    } else {
      clearInviteIntentCookie(response);
    }

    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
