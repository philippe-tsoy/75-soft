import { clearInviteIntentCookie } from "@/features/auth/invite-intent";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { handleRouteError, noContent } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new Error("Unable to sign out");
    }

    const response = noContent();
    clearInviteIntentCookie(response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
