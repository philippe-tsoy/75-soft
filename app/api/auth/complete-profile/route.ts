import { cookies } from "next/headers";

import {
  clearInviteIntentCookie,
  INVITE_INTENT_COOKIE,
} from "@/features/auth/invite-intent";
import { completeInviteSignup } from "@/features/auth/registration";
import {
  getFormFile,
  getFormString,
  profileCompletionSchema,
  validationDetails,
} from "@/features/auth/validation";
import { validateProfilePhoto } from "@/features/profiles/service";
import { getSessionUser } from "@/lib/auth/access";
import { fail, handleRouteError, HttpError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readCompletionRequest(request: Request): Promise<{
  fields: unknown;
  avatar: File | null;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return {
      fields: {
        displayName: getFormString(formData, "displayName"),
        timezone: getFormString(formData, "timezone"),
      },
      avatar: getFormFile(formData, "avatar"),
    };
  }

  try {
    return { fields: await request.json(), avatar: null };
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Request body is invalid");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return fail(401, "AUTH_REQUIRED", "Authentication is required");
    }

    const { fields, avatar } = await readCompletionRequest(request);
    const parsed = profileCompletionSchema.safeParse(fields);
    if (!parsed.success) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "Profile details are invalid",
        validationDetails(parsed.error),
      );
    }

    if (avatar) {
      validateProfilePhoto(avatar);
    }

    const inviteToken =
      (await cookies()).get(INVITE_INTENT_COOKIE)?.value ?? null;
    const profile = await completeInviteSignup(
      user,
      {
        displayName: parsed.data.displayName,
        timezone: parsed.data.timezone,
        avatar,
      },
      inviteToken,
    );
    const response = ok({ profile }, 201);
    clearInviteIntentCookie(response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
