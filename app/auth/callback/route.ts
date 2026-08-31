import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  clearInviteIntentCookie,
  INVITE_INTENT_COOKIE,
} from "@/features/auth/invite-intent";
import {
  bindInviteIntentToUser,
  findPendingInviteIntentForUser,
  findValidInviteIntent,
} from "@/features/auth/invite-service";
import {
  getMembershipState,
  getProfileMetadata,
  completeInviteSignup,
  hasConflictingProfileEmail,
} from "@/features/auth/registration";
import { safeInternalRedirect } from "@/features/auth/redirects";
import { getPublicEnv } from "@/lib/config/env";
import { handleRouteError } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function setRedirect(
  response: NextResponse,
  request: NextRequest,
  path: string,
) {
  response.headers.set("Location", new URL(path, request.url).toString());
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", request.url),
  );

  try {
    const code = request.nextUrl.searchParams.get("code");
    const type = request.nextUrl.searchParams.get("type");
    const nextPath = safeInternalRedirect(
      request.nextUrl.searchParams.get("next"),
      "/today",
    );

    if (!code) {
      setRedirect(
        response,
        request,
        type === "recovery"
          ? "/forgot-password?error=missing_auth_code"
          : "/login?error=missing_auth_code",
      );
      return response;
    }

    const env = getPublicEnv();
    const supabase = createServerClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      setRedirect(
        response,
        request,
        type === "recovery"
          ? "/forgot-password?error=auth_callback_failed"
          : "/login?error=auth_callback_failed",
      );
      return response;
    }

    if (type === "recovery") {
      setRedirect(response, request, "/reset-password");
      return response;
    }

    const admin = createSupabaseAdminClient();
    if (
      data.user.email &&
      (await hasConflictingProfileEmail(data.user.id, data.user.email, admin))
    ) {
      await supabase.auth.signOut();
      setRedirect(response, request, "/login?error=account_conflict");
      clearInviteIntentCookie(response);
      return response;
    }

    const membershipState = await getMembershipState(data.user.id, admin);
    if (type !== "signup") {
      await supabase.auth.signOut();
      setRedirect(response, request, "/login?error=auth_callback_failed");
      return response;
    }

    if (membershipState === "active") {
      setRedirect(response, request, nextPath);
      return response;
    }

    if (membershipState === "removed") {
      await supabase.auth.signOut();
      setRedirect(response, request, "/login?error=removed");
      return response;
    }

    if (type === "signup") {
      const token = request.cookies.get(INVITE_INTENT_COOKIE)?.value ?? null;
      const intent =
        (await findPendingInviteIntentForUser(data.user.id, admin)) ??
        (await findValidInviteIntent(token, admin, Date.now(), data.user.id));
      const metadata = getProfileMetadata(data.user);

      if (!intent || !metadata.displayName || !metadata.timezone) {
        await supabase.auth.signOut();
        setRedirect(response, request, "/invite?error=invite_required");
        clearInviteIntentCookie(response);
        return response;
      }

      await bindInviteIntentToUser(
        intent.id,
        data.user.id,
        data.user.email ?? null,
        admin,
      );
      await completeInviteSignup(
        data.user,
        {
          displayName: metadata.displayName,
          timezone: metadata.timezone,
          avatarPath: metadata.avatarPath,
        },
        token,
        admin,
      );
      setRedirect(response, request, "/today");
      clearInviteIntentCookie(response);
      return response;
    }

    await supabase.auth.signOut();
    setRedirect(response, request, "/invite?error=invite_required");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
