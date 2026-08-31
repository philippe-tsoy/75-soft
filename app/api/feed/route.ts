import { handleRouteError, paginated, requireActiveMember } from "@/lib/http";

import {
  createFeedClient,
  listFeed,
  parseFeedLimit,
  decodeFeedCursor,
} from "@/features/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireActiveMember();
    const url = new URL(request.url);
    const cursorValue = url.searchParams.get("cursor");
    const limit = parseFeedLimit(url.searchParams.get("limit"));
    decodeFeedCursor(cursorValue);

    const client = await createFeedClient();
    const page = await listFeed({
      client,
      cohortId: access.membership.cohortId,
      viewerId: access.user.id,
      viewerIsAdmin: access.membership.role === "admin",
      cursor: cursorValue,
      limit,
    });

    return paginated(page.data, page.nextCursor);
  } catch (error) {
    return handleRouteError(error);
  }
}
