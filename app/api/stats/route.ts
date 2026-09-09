import {
  handleRouteError,
  ok,
  requireActiveMember,
  requireSession,
} from "@/lib/http";
import { getMemberStats } from "@/features/stats/database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const access = await requireActiveMember(session);
    const stats = await getMemberStats(access.user.id);
    return ok(stats);
  } catch (error) {
    return handleRouteError(error);
  }
}
