import {
  createOptionalGoal,
  listOptionalGoalRows,
  optionalGoalRowToDTO,
  optionalGoalRowsToDTO,
} from "@/features/optional-goals/database";
import {
  handleOptionalGoalRouteError,
  privateResponse,
  readJson,
  requireOptionalGoalAccess,
} from "@/app/api/optional-goals/route-helpers";
import { ok } from "@/lib/http";
import { parseOptionalGoalPayload } from "@/features/optional-goals/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireOptionalGoalAccess(request);
    const rows = await listOptionalGoalRows(access.membership.userId);

    return privateResponse(ok(optionalGoalRowsToDTO(rows)));
  } catch (error) {
    return handleOptionalGoalRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireOptionalGoalAccess(request);
    const body = await readJson(request);
    const input = parseOptionalGoalPayload(body);
    const row = await createOptionalGoal(access.membership.userId, input);

    return privateResponse(ok(optionalGoalRowToDTO(row), 201));
  } catch (error) {
    return handleOptionalGoalRouteError(error);
  }
}
