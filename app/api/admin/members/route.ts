import { requireAdmin } from "@/lib/auth/access";
import { handleRouteError, ok } from "@/lib/http";

import { listAdminMembers } from "@/features/admin/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    return ok(await listAdminMembers());
  } catch (error) {
    return handleRouteError(error);
  }
}
