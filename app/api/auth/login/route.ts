import { safeInternalRedirect } from "@/features/auth/redirects";
import { loginSchema, validationDetails } from "@/features/auth/validation";
import { getMembershipState } from "@/features/auth/registration";
import { getCurrentProfile } from "@/features/profiles/service";
import { fail, handleRouteError, HttpError, ok } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "Login details are invalid",
        validationDetails(parsed.error),
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error || !data.user) {
      throw new HttpError(
        401,
        "AUTH_REQUIRED",
        "Unable to sign in with those details",
      );
    }

    const membershipState = await getMembershipState(
      data.user.id,
      createSupabaseAdminClient(),
    );
    if (membershipState === "removed") {
      await supabase.auth.signOut();
      throw new HttpError(
        403,
        "FORBIDDEN",
        "This account no longer has group access",
      );
    }

    if (membershipState === "active") {
      const profile = await getCurrentProfile();
      return ok({
        state: "active" as const,
        redirectTo: safeInternalRedirect(parsed.data.next, "/today"),
        user: profile,
      });
    }

    return ok({
      state: "no_membership" as const,
      redirectTo: "/invite",
      user: null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
