import {
  createOptionalGoalsClient,
  findOptionalGoalLogByOperationId,
  findOptionalGoalRow,
  getOwnerTimezone,
  insertOptionalGoalLogIdempotent,
  listOptionalGoalLogRows,
  optionalGoalLogRowToDTO,
  optionalGoalRowToDTO,
} from "@/features/optional-goals/database";
import {
  handleOptionalGoalRouteError,
  privateResponse,
  readJson,
  requireOptionalGoalAccess,
  resolveClientOperationId,
} from "@/app/api/optional-goals/route-helpers";
import { getMemberLocalDate } from "@/lib/dates";
import { HttpError, ok } from "@/lib/http";
import {
  assertOptionalGoalLogDate,
  buildOptionalGoalLogResult,
  normalizeOptionalGoalLogForGoal,
} from "@/features/optional-goals/service";
import {
  parseOptionalGoalId,
  parseOptionalGoalLog,
} from "@/features/optional-goals/validation";

export const dynamic = "force-dynamic";

type OptionalGoalRouteContext = {
  params: Promise<{ id: string }>;
};

function notFoundError(): HttpError {
  return new HttpError(404, "NOT_FOUND", "The optional goal was not found");
}

export async function POST(
  request: Request,
  context: OptionalGoalRouteContext,
) {
  try {
    const access = await requireOptionalGoalAccess(request);
    const { id } = await context.params;
    const goalId = parseOptionalGoalId(id);
    const body = parseOptionalGoalLog(await readJson(request));
    const operationId = resolveClientOperationId(
      request,
      body.clientOperationId,
    );
    const input = { ...body, clientOperationId: operationId };
    const client = await createOptionalGoalsClient();
    const existingLog = await findOptionalGoalLogByOperationId(
      access.membership.userId,
      operationId,
      client,
    );

    if (existingLog) {
      if (existingLog.optional_goal_id !== goalId) {
        throw new HttpError(
          409,
          "CONFLICT",
          "The operation id was already used for another optional goal",
        );
      }

      const existingGoalRow = await findOptionalGoalRow(
        access.membership.userId,
        goalId,
        client,
      );
      if (!existingGoalRow) {
        throw notFoundError();
      }

      const history = await listOptionalGoalLogRows(
        access.membership.userId,
        goalId,
        client,
      );
      const result = buildOptionalGoalLogResult(
        optionalGoalRowToDTO(existingGoalRow),
        optionalGoalLogRowToDTO(existingLog),
        history.map(optionalGoalLogRowToDTO),
      );

      return privateResponse(ok(result, 200));
    }

    const goalRow = await findOptionalGoalRow(
      access.membership.userId,
      goalId,
      client,
    );
    if (!goalRow) {
      throw notFoundError();
    }

    const goal = optionalGoalRowToDTO(goalRow);
    if (!goal.active) {
      throw new HttpError(
        422,
        "BUSINESS_RULE_VIOLATION",
        "Archived optional goals cannot receive new logs",
      );
    }

    const normalizedInput = normalizeOptionalGoalLogForGoal(goal, input);
    const timezone = await getOwnerTimezone(access.membership.userId, client);
    if (!timezone) {
      throw new HttpError(
        500,
        "INTERNAL_ERROR",
        "The member timezone is unavailable",
      );
    }

    const memberLocalDate = getMemberLocalDate(new Date(), timezone);
    assertOptionalGoalLogDate(
      normalizedInput.localDate,
      memberLocalDate,
      access.membership.joinLocalDate,
    );

    const inserted = await insertOptionalGoalLogIdempotent(
      access.membership.userId,
      normalizedInput,
      goalId,
      client,
    );

    if (inserted.row.optional_goal_id !== goalId) {
      throw new HttpError(
        409,
        "CONFLICT",
        "The operation id was already used for another optional goal",
      );
    }

    const history = await listOptionalGoalLogRows(
      access.membership.userId,
      goalId,
      client,
    );
    const result = buildOptionalGoalLogResult(
      goal,
      optionalGoalLogRowToDTO(inserted.row),
      history.map(optionalGoalLogRowToDTO),
    );

    return privateResponse(ok(result, inserted.idempotent ? 200 : 201));
  } catch (error) {
    return handleOptionalGoalRouteError(error);
  }
}
