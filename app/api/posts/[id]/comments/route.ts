import { handleRouteError, ok, requireActiveMember } from "@/lib/http";

import {
  createComment,
  createFeedClient,
  parseOptionalOperationId,
} from "@/features/feed";
import {
  readJson,
  readObject,
  requireRouteId,
} from "@/features/feed/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommentsRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: CommentsRouteContext) {
  try {
    const access = await requireActiveMember();
    const { id } = await params;
    const postId = requireRouteId(id, "post");
    const body = readObject(await readJson(request));
    const client = await createFeedClient();
    const result = await createComment({
      client,
      postId,
      authorId: access.user.id,
      authorIsAdmin: access.membership.role === "admin",
      body: body.body,
      clientOperationId: parseOptionalOperationId(request),
    });
    return ok({ comment: result.comment }, result.idempotent ? 200 : 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
