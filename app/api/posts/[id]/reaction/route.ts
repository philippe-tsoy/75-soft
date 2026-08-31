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
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, { params }: ReactionRouteContext) {
  try {
    const access = await requireActiveMember();
    const { id } = await params;
    const postId = requireRouteId(id, "post");
    const body = readObject(await readJson(request));
    const client = await createFeedClient();
    const reaction = await setReaction({
      client,
      postId,
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
    const { id } = await params;
    const postId = requireRouteId(id, "post");
    const client = await createFeedClient();
    await removeReaction({
      client,
      postId,
      userId: access.user.id,
    });
    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
