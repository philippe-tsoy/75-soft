import { requireAdmin } from "@/lib/auth/access";
import { handleRouteError, ok } from "@/lib/http";

import { removeAdminMember } from "@/features/admin/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireAdmin();
    const { userId } = await params;
    return ok(await removeAdminMember(userId));
  } catch (error) {
    return handleRouteError(error);
  }
}
