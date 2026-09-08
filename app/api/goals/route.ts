import {
  createGoal,
  goalRowToDTO,
  goalRowsToDTO,
  listGoalRows,
} from "@/features/goals/database";
import {
  handleGoalRouteError,
  privateResponse,
  readJson,
  requireGoalAccess,
} from "@/app/api/goals/route-helpers";
import { ok } from "@/lib/http";
import { parseGoalPayload } from "@/features/goals/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireGoalAccess(request);
    const rows = await listGoalRows(access.membership.userId);

    return privateResponse(ok(goalRowsToDTO(rows)));
  } catch (error) {
    return handleGoalRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireGoalAccess(request);
    const body = await readJson(request);
    const input = parseGoalPayload(body);
    const row = await createGoal(access.membership.userId, input);

    return privateResponse(ok(goalRowToDTO(row), 201));
  } catch (error) {
    return handleGoalRouteError(error);
  }
}
