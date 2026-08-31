import {
  handleRouteError,
  ok,
  requireActiveMember,
  requireSession,
} from "@/lib/http";
import { getBoardEntries } from "@/features/board/database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const access = await requireActiveMember(session);
    const entries = await getBoardEntries(access.user.id);
    return ok(entries);
  } catch (error) {
    return handleRouteError(error);
  }
}
