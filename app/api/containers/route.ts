import { requireActiveMember } from "@/lib/auth/access";
import { handleRouteError, ok } from "@/lib/http";

import { createDayTrackingServices } from "@/features/day-tracking";
import {
  parseContainerCreateInput,
  readJsonBody,
} from "@/features/day-tracking/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await requireActiveMember();
    const { containers } = await createDayTrackingServices();
    return ok(await containers.listContainers(access.user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireActiveMember();
    const input = parseContainerCreateInput(await readJsonBody(request));
    const { containers } = await createDayTrackingServices();
    const container = await containers.createContainer(access.user.id, input);

    return ok(container, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
