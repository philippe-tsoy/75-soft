import { requireAdmin } from "@/lib/auth/access";
import { handleRouteError, HttpError, ok } from "@/lib/http";

import {
  createGoalTemplate,
  goalTemplateRowToAdminDTO,
  listAllGoalTemplateRows,
} from "@/features/goal-templates/database";
import { parseGoalTemplatePayload } from "@/features/goal-templates/validation";

export const dynamic = "force-dynamic";

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

export async function GET() {
  try {
    await requireAdmin();
    const rows = await listAllGoalTemplateRows();

    return ok(rows.map(goalTemplateRowToAdminDTO));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const input = parseGoalTemplatePayload(await readJson(request));
    const row = await createGoalTemplate(input);

    return ok(goalTemplateRowToAdminDTO(row), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
