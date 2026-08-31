import { handleRouteError, ok, requireActiveMember } from "@/lib/http";

import {
  createFeedClient,
  getReactionPalette,
  updateReactionPalette,
} from "@/features/feed";
import { readJson, readObject } from "@/features/feed/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await requireActiveMember();
    const client = await createFeedClient();
    const emoji = await getReactionPalette(client, access.user.id);
    return ok({ emoji });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const access = await requireActiveMember();
    const body = readObject(await readJson(request));
    const client = await createFeedClient();
    const emoji = await updateReactionPalette({
      client,
      userId: access.user.id,
      value: { emoji: body.emoji },
    });
    return ok({ emoji });
  } catch (error) {
    return handleRouteError(error);
  }
}
