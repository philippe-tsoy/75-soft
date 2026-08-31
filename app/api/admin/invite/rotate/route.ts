import { requireAdmin } from "@/lib/auth/access";
import { handleRouteError, ok } from "@/lib/http";

import { rotateAdminInvite } from "@/features/admin/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const origin = new URL(request.url).origin;
    return ok(await rotateAdminInvite(origin), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
