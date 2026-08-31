import { requireAdmin } from "@/lib/auth/access";
import { handleRouteError, ok } from "@/lib/http";

import { parseAdminInput, readAdminJson } from "@/features/admin/http";
import { invalidateAdminMemberDay } from "@/features/admin/service";
import { adminInvalidationInputSchema } from "@/features/admin/validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireAdmin();
    const { userId } = await params;
    const body = parseAdminInput(
      adminInvalidationInputSchema,
      await readAdminJson(request),
      "The invalidation request is invalid",
    );
    return ok(await invalidateAdminMemberDay(userId, body), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
