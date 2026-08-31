import {
  handleRouteError,
  noContent,
  ok,
  requireActiveMember,
} from "@/lib/http";

import { createFeedClient, removeReaction, setReaction } from "@/features/feed";
import {
  readJson,
  readObject,
  requireRouteId,
} from "@/features/feed/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReactionRouteContext = {
  params: Promise<{ postId: string }>;
};

// This is a thin compatibility route for clients that use /api/reactions.
// Business logic remains in features/feed and the canonical contract route.
export async function PUT(request: Request, { params }: ReactionRouteContext) {
  try {
    const access = await requireActiveMember();
    const { postId } = await params;
    const id = requireRouteId(postId, "post");
    const body = readObject(await readJson(request));
    const client = await createFeedClient();
    const reaction = await setReaction({
      client,
      postId: id,
      userId: access.user.id,
      emoji: body.emoji,
    });
    return ok({ reaction });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: ReactionRouteContext,
) {
  try {
    const access = await requireActiveMember();
    const { postId } = await params;
    const id = requireRouteId(postId, "post");
    const client = await createFeedClient();
    await removeReaction({
      client,
      postId: id,
      userId: access.user.id,
    });
    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
