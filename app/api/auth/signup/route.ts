import { cookies } from "next/headers";

import {
  clearInviteIntentCookie,
  INVITE_INTENT_COOKIE,
} from "@/features/auth/invite-intent";
import {
  bindInviteIntentToUser,
  findValidInviteIntent,
} from "@/features/auth/invite-service";
import { completeInviteSignup } from "@/features/auth/registration";
import {
  getFormFile,
  getFormString,
  signupFieldsSchema,
  validationDetails,
} from "@/features/auth/validation";
import {
  validateProfilePhoto,
  uploadProfilePhoto,
} from "@/features/profiles/service";
import { HttpError, fail, handleRouteError, ok } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authSignupError(): HttpError {
  return new HttpError(
    400,
    "VALIDATION_ERROR",
    "Unable to create an account with those details",
  );
}

async function readSignupRequest(request: Request): Promise<{
  fields: unknown;
  avatar: File | null;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return {
      fields: {
        email: getFormString(formData, "email"),
        password: getFormString(formData, "password"),
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
    const cookieStore = await cookies();
    const inviteToken = cookieStore.get(INVITE_INTENT_COOKIE)?.value;
    const intent = await findValidInviteIntent(inviteToken);
    if (!intent) {
      return fail(
        409,
        "CONFLICT",
        "A valid invite is required to create an account",
      );
    }

    const { fields, avatar } = await readSignupRequest(request);
    const parsed = signupFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "Account details are invalid",
        validationDetails(parsed.error),
      );
    }

    if (avatar) {
      validateProfilePhoto(avatar);
    }

    const supabase = await createSupabaseServerClient();
    const emailRedirectTo = new URL("/auth/callback?type=signup", request.url);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          display_name: parsed.data.displayName,
          timezone: parsed.data.timezone,
        },
        emailRedirectTo: emailRedirectTo.toString(),
      },
    });

    if (error || !data.user) {
      throw authSignupError();
    }

    if (!data.user.identities?.length) {
      throw authSignupError();
    }

    const admin = createSupabaseAdminClient();
    let avatarPath: string | null = null;
    let retainAvatar = false;

    try {
      if (avatar) {
        avatarPath = await uploadProfilePhoto(admin, data.user.id, avatar);
        const { error: metadataError } = await admin.auth.admin.updateUserById(
          data.user.id,
          {
            user_metadata: {
              ...data.user.user_metadata,
              display_name: parsed.data.displayName,
              timezone: parsed.data.timezone,
              avatar_path: avatarPath,
            },
          },
        );

        if (metadataError) {
          throw new Error("Unable to save pending profile");
        }
      }

      await bindInviteIntentToUser(
        intent.id,
        data.user.id,
        parsed.data.email,
        admin,
      );

      if (!data.session) {
        retainAvatar = true;
        return ok(
          {
            state: "awaiting_email_confirmation" as const,
            user: null,
          },
          202,
        );
      }

      const profile = await completeInviteSignup(
        data.user,
        {
          displayName: parsed.data.displayName,
          timezone: parsed.data.timezone,
          avatarPath,
        },
        inviteToken,
        admin,
      );
      retainAvatar = true;
      const response = ok(
        {
          state: "active" as const,
          user: profile,
        },
        201,
      );
      clearInviteIntentCookie(response);
      return response;
    } catch (error) {
      if (avatarPath && !retainAvatar) {
        await admin.storage
          .from("post-photos")
          .remove([avatarPath])
          .catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
