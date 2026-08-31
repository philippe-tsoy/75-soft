import {
  passwordUpdateSchema,
  validationDetails,
} from "@/features/auth/validation";
import { getSessionUser } from "@/lib/auth/access";
import { fail, handleRouteError, HttpError, ok } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      throw new HttpError(
        401,
        "AUTH_REQUIRED",
        "Authentication is required to change the password",
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail(400, "VALIDATION_ERROR", "Request body is invalid");
    }

    const parsed = passwordUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "Password details are invalid",
        validationDetails(parsed.error),
      );
    }

    if (parsed.data.password !== parsed.data.confirmPassword) {
      return fail(400, "VALIDATION_ERROR", "Passwords do not match");
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) {
      throw new HttpError(400, "VALIDATION_ERROR", "Unable to update password");
    }

    return ok({ state: "updated" as const });
  } catch (error) {
    return handleRouteError(error);
  }
}
