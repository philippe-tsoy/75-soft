import {
  passwordResetSchema,
  validationDetails,
} from "@/features/auth/validation";
import { fail, handleRouteError, ok } from "@/lib/http";
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

    const parsed = passwordResetSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "Email address is invalid",
        validationDetails(parsed.error),
      );
    }

    const supabase = await createSupabaseServerClient();
    const redirectTo = new URL(
      "/auth/callback?type=recovery&next=/reset-password",
      request.url,
    ).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo },
    );

    if (error) {
      throw new Error("Unable to request password reset");
    }

    return ok(
      {
        message:
          "If an account exists for that email, a password reset link is on its way.",
      },
      202,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
