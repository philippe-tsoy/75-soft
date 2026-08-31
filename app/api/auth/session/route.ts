import { getAccessContext, getSessionUser } from "@/lib/auth/access";
import { fail, handleRouteError, ok } from "@/lib/http";

import { getProfileForUser } from "@/features/profiles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return ok({
        authenticated: false,
        member: false,
        user: null,
        role: null,
      });
    }

    const access = await getAccessContext();
    if (!access) {
      return ok({
        authenticated: true,
        member: false,
        user: null,
        role: null,
      });
    }

    const profile = await getProfileForUser(user.id, access.membership.role);
    if (!profile) {
      return fail(500, "INTERNAL_ERROR", "Unable to load session");
    }

    return ok({
      authenticated: true,
      member: true,
      user: profile,
      role: access.membership.role,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
