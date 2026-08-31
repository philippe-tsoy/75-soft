import { handleRouteError, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/access";

import { getAdminInvite } from "@/features/admin/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const origin = new URL(request.url).origin;
    return ok(await getAdminInvite(origin));
  } catch (error) {
    return handleRouteError(error);
  }
}
