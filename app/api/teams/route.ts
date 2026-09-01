import { requireActiveMember } from "@/lib/auth/access";
import { handleRouteError, HttpError, ok } from "@/lib/http";

import {
  createTeam,
  getGlobalPercentage,
  getTeamBoard,
} from "@/features/teams/database";

export const dynamic = "force-dynamic";

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

export async function GET() {
  try {
    const access = await requireActiveMember();
    const [teams, globalPct] = await Promise.all([
      getTeamBoard(access.user.id),
      getGlobalPercentage(access.user.id),
    ]);

    return ok({ teams, globalPct });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireActiveMember();
    const body = await request.json().catch(() => null);
    const name = parseTeamName(body);
    const teamId = await createTeam(name);

    return ok({ teamId }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
