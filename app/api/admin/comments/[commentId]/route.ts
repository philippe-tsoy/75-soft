import { requireAdmin } from "@/lib/auth/access";
import { handleRouteError, ok } from "@/lib/http";

import { deleteAdminComment } from "@/features/admin/service";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  try {
    await requireAdmin();
    const { commentId } = await params;
    return ok(await deleteAdminComment(commentId));
  } catch (error) {
    return handleRouteError(error);
  }
}
