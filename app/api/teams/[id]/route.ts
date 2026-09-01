import { requireActiveMember } from "@/lib/auth/access";
import { handleRouteError, HttpError, ok } from "@/lib/http";
import { operationIdSchema } from "@/lib/validation";

import { getTeamSummary, renameTeam } from "@/features/teams/database";

export const dynamic = "force-dynamic";

interface TeamRouteContext {
  params: Promise<{ id: string }>;
}

function parseTeamId(value: string): string {
  const parsed = operationIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Team id must be a UUID");
  }

  return parsed.data;
}

function parseTeamName(body: unknown): string {
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).name !== "string"
  ) {
    throw new HttpError(400, "VALIDATION_ERROR", "A team name is required");
  }

  const name = ((body as Record<string, unknown>).name as string).trim();
  if (name.length < 2 || name.length > 40) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Team names must be 2–40 characters",
    );
  }

  return name;
}

export async function GET(_request: Request, { params }: TeamRouteContext) {
  try {
    const access = await requireActiveMember();
    const { id } = await params;
    const teamId = parseTeamId(id);
    const summary = await getTeamSummary(access.user.id, teamId);

    return ok(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: TeamRouteContext) {
  try {
    const access = await requireActiveMember();
    const { id } = await params;
    const teamId = parseTeamId(id);
    const body = await request.json().catch(() => null);
    const name = parseTeamName(body);

    await renameTeam(teamId, name);
    const summary = await getTeamSummary(access.user.id, teamId);

    return ok(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
