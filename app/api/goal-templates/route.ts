import { requireActiveMember, requireSession } from "@/lib/http";
import { handleRouteError, ok } from "@/lib/http";

import {
  goalTemplateRowToDTO,
  listActiveGoalTemplateRows,
} from "@/features/goal-templates/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    await requireActiveMember();
    const rows = await listActiveGoalTemplateRows();

    return ok(rows.map(goalTemplateRowToDTO));
  } catch (error) {
    return handleRouteError(error);
  }
}
