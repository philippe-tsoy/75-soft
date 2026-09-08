import {
  createGoalsClient,
  findGoalRow,
  goalRowToDTO,
  updateGoal,
} from "@/features/goals/database";
import {
  handleGoalRouteError,
  privateResponse,
  readJson,
  requireGoalAccess,
} from "@/app/api/goals/route-helpers";
import { HttpError, ok } from "@/lib/http";
import {
  mergeGoalPatch,
  parseGoalId,
  parseGoalPatch,
} from "@/features/goals/validation";

export const dynamic = "force-dynamic";

type GoalRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: GoalRouteContext) {
  try {
    const access = await requireGoalAccess(request);
    const { id } = await context.params;
    const goalId = parseGoalId(id);
    const patch = parseGoalPatch(await readJson(request));
    const client = await createGoalsClient();
    const currentRow = await findGoalRow(
      access.membership.userId,
      goalId,
      client,
    );

    if (!currentRow) {
      return handleGoalRouteError(
        new HttpError(404, "NOT_FOUND", "The goal was not found"),
      );
    }

    const current = goalRowToDTO(currentRow);
    const hasMetadataPatch =
      patch.name !== undefined ||
      Object.prototype.hasOwnProperty.call(patch, "targetValue") ||
      Object.prototype.hasOwnProperty.call(patch, "unit");
    const update = hasMetadataPatch
      ? { ...patch, ...mergeGoalPatch(current, patch) }
      : patch;
    const updatedRow = await updateGoal(
      access.membership.userId,
      goalId,
      update,
      client,
    );

    if (!updatedRow) {
      return handleGoalRouteError(
        new HttpError(404, "NOT_FOUND", "The goal was not found"),
      );
    }

    return privateResponse(ok(goalRowToDTO(updatedRow)));
  } catch (error) {
    return handleGoalRouteError(error);
  }
}
