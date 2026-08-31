import { handleRouteError, ok, requireActiveMember } from "@/lib/http";

import { createFeedClient, deletePost, getVisiblePost } from "@/features/feed";
import { requireRouteId } from "@/features/feed/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: PostRouteContext) {
  try {
    const access = await requireActiveMember();
    const { id } = await params;
    const postId = requireRouteId(id, "post");
    const client = await createFeedClient();
    const post = await getVisiblePost({
      client,
      postId,
      cohortId: access.membership.cohortId,
      viewerId: access.user.id,
      viewerIsAdmin: access.membership.role === "admin",
    });
    return ok({ post });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: PostRouteContext) {
  try {
    const access = await requireActiveMember();
    const { id } = await params;
    const postId = requireRouteId(id, "post");
    const client = await createFeedClient();
    const result = await deletePost({
      client,
      postId,
      actorId: access.user.id,
      actorIsAdmin: access.membership.role === "admin",
      cohortId: access.membership.cohortId,
    });
    return ok({ postId, day: result.day });
  } catch (error) {
    return handleRouteError(error);
  }
}
