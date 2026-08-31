import { requireAdmin } from "@/lib/auth/access";
import { handleRouteError, ok } from "@/lib/http";

import { deleteAdminPost } from "@/features/admin/service";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    await requireAdmin();
    const { postId } = await params;
    return ok(await deleteAdminPost(postId));
  } catch (error) {
    return handleRouteError(error);
  }
}
