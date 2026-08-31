import { handleRouteError, noContent, requireActiveMember } from "@/lib/http";

import { createFeedClient, deleteComment } from "@/features/feed";
import { requireRouteId } from "@/features/feed/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommentRouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(
  _request: Request,
  { params }: CommentRouteContext,
) {
  try {
    const access = await requireActiveMember();
    const { id } = await params;
    const commentId = requireRouteId(id, "comment");
    const client = await createFeedClient();
    await deleteComment({
      client,
      commentId,
      actorId: access.user.id,
      actorIsAdmin: access.membership.role === "admin",
    });
    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
