import {
  getCurrentAmountInputMode,
  updateCurrentAmountInputMode,
} from "@/features/profiles/service";
import { validationDetails } from "@/features/auth/validation";
import { fail, handleRouteError, ok } from "@/lib/http";
import { amountInputModeUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const amountInputMode = await getCurrentAmountInputMode();
    return ok({ amountInputMode });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = amountInputModeUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "Tracker preferences are invalid",
        validationDetails(parsed.error),
      );
    }

    const amountInputMode = await updateCurrentAmountInputMode(
      parsed.data.amountInputMode,
    );
    return ok({ amountInputMode });
  } catch (error) {
    return handleRouteError(error);
  }
}
