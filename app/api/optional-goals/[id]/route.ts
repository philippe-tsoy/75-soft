import {
  createOptionalGoalsClient,
  findOptionalGoalRow,
  optionalGoalRowToDTO,
  updateOptionalGoal,
} from "@/features/optional-goals/database";
import {
  handleOptionalGoalRouteError,
  privateResponse,
  readJson,
  requireOptionalGoalAccess,
} from "@/app/api/optional-goals/route-helpers";
import { HttpError, ok } from "@/lib/http";
import {
  mergeOptionalGoalPatch,
  parseOptionalGoalId,
  parseOptionalGoalPatch,
} from "@/features/optional-goals/validation";

export const dynamic = "force-dynamic";

type OptionalGoalRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: Request,
  context: OptionalGoalRouteContext,
) {
  try {
    const access = await requireOptionalGoalAccess(request);
    const { id } = await context.params;
    const goalId = parseOptionalGoalId(id);
    const patch = parseOptionalGoalPatch(await readJson(request));
    const client = await createOptionalGoalsClient();
    const currentRow = await findOptionalGoalRow(
      access.membership.userId,
      goalId,
      client,
    );

    if (!currentRow) {
      return handleOptionalGoalRouteError(
        new HttpError(404, "NOT_FOUND", "The optional goal was not found"),
      );
    }

    const current = optionalGoalRowToDTO(currentRow);
    const hasMetadataPatch =
      patch.name !== undefined ||
      Object.prototype.hasOwnProperty.call(patch, "targetValue") ||
      Object.prototype.hasOwnProperty.call(patch, "unit");
    const update = hasMetadataPatch
      ? { ...patch, ...mergeOptionalGoalPatch(current, patch) }
      : patch;
    const updatedRow = await updateOptionalGoal(
      access.membership.userId,
      goalId,
      update,
      client,
    );

    if (!updatedRow) {
      return handleOptionalGoalRouteError(
        new HttpError(404, "NOT_FOUND", "The optional goal was not found"),
      );
    }

    return privateResponse(ok(optionalGoalRowToDTO(updatedRow)));
  } catch (error) {
    return handleOptionalGoalRouteError(error);
  }
}
