import { requireActiveMember } from "@/lib/auth/access";
import { handleRouteError, HttpError, noContent, ok } from "@/lib/http";
import { operationIdSchema } from "@/lib/validation";

import { createDayTrackingServices } from "@/features/day-tracking";
import {
  parseContainerUpdateInput,
  readJsonBody,
} from "@/features/day-tracking/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContainerRouteContext {
  params: Promise<{ id: string }>;
}

function parseContainerId(value: string): string {
  const parsed = operationIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Container id must be a UUID");
  }

  return parsed.data;
}

export async function PATCH(
  request: Request,
  { params }: ContainerRouteContext,
) {
  try {
    const access = await requireActiveMember();
    const { id: rawId } = await params;
    const id = parseContainerId(rawId);
    const input = parseContainerUpdateInput(await readJsonBody(request));
    const { containers } = await createDayTrackingServices();
    return ok(await containers.updateContainer(access.user.id, id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: ContainerRouteContext,
) {
  try {
    const access = await requireActiveMember();
    const { id: rawId } = await params;
    const id = parseContainerId(rawId);
    const { containers } = await createDayTrackingServices();
    await containers.deleteContainer(access.user.id, id);
    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
