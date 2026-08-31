import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  clearInviteIntentCookie,
  createOAuthStatePayload,
  INVITE_INTENT_COOKIE,
  signOAuthState,
} from "@/features/auth/invite-intent";
import { findValidInviteIntent } from "@/features/auth/invite-service";
import { safeInternalRedirect } from "@/features/auth/redirects";
import { getAccessContext } from "@/lib/auth/access";
import { getPublicEnv, getServerEnv } from "@/lib/config/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const nextPath = safeInternalRedirect(
    request.nextUrl.searchParams.get("next"),
    "/today",
  );
  const existingAccess = await getAccessContext();
  if (existingAccess) {
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  const token = request.cookies.get(INVITE_INTENT_COOKIE)?.value ?? null;
  const intent = await findValidInviteIntent(
    token,
    createSupabaseAdminClient(),
  );
  if (token && !intent) {
    const response = NextResponse.redirect(
      new URL("/invite?error=invite_required", request.url),
    );
    clearInviteIntentCookie(response);
    return response;
  }

  const nonce = intent?.nonce ?? randomBytes(24).toString("base64url");
  const state = signOAuthState(
    createOAuthStatePayload({
      inviteIntentId: intent?.id ?? null,
      inviteCodeHash: intent?.inviteDigest ?? null,
      nonce,
    }),
    getServerEnv().INVITE_INTENT_SECRET,
  );

  const env = getPublicEnv();
  const response = NextResponse.redirect(
    new URL("/login?error=oauth_start_failed", request.url),
  );
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

  const callbackUrl = new URL("/auth/callback", request.url);
  callbackUrl.searchParams.set("next", nextPath);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: { state },
    },
  });

  if (error || !data.url) {
    return response;
  }

  response.headers.set("Location", data.url);
  return response;
}
