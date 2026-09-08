import { requireAdmin } from "@/lib/auth/access";
import { handleRouteError, HttpError, ok } from "@/lib/http";

import {
  goalTemplateRowToAdminDTO,
  updateGoalTemplate,
} from "@/features/goal-templates/database";
import {
  parseGoalTemplateId,
  parseGoalTemplatePatch,
} from "@/features/goal-templates/validation";

export const dynamic = "force-dynamic";

type GoalTemplateRouteContext = {
  params: Promise<{ id: string }>;
};

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Request body must be valid JSON",
    );
  }
}

export async function PATCH(
  request: Request,
  context: GoalTemplateRouteContext,
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const templateId = parseGoalTemplateId(id);
    const patch = parseGoalTemplatePatch(await readJson(request));
    const row = await updateGoalTemplate(templateId, patch);

    if (!row) {
      throw new HttpError(404, "NOT_FOUND", "The template was not found");
    }

    return ok(goalTemplateRowToAdminDTO(row));
  } catch (error) {
    return handleRouteError(error);
  }
}
