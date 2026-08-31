import {
  getFormFile,
  getFormString,
  validationDetails,
} from "@/features/auth/validation";
import {
  getCurrentProfileWithSettings,
  updateCurrentProfile,
  validateProfilePhoto,
} from "@/features/profiles/service";
import { fail, handleRouteError, ok } from "@/lib/http";
import { profileUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getCurrentProfileWithSettings();
    return ok({
      ...settings.profile,
      palette: settings.palette,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function readPatchRequest(request: Request): Promise<{
  fields: unknown;
  avatar: File | null;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return {
      fields: {
        ...(getFormString(formData, "displayName") !== undefined
          ? { displayName: getFormString(formData, "displayName") }
          : {}),
        ...(getFormString(formData, "timezone") !== undefined
          ? { timezone: getFormString(formData, "timezone") }
          : {}),
      },
      avatar: getFormFile(formData, "avatar"),
    };
  }

  try {
    return { fields: await request.json(), avatar: null };
  } catch {
    return { fields: null, avatar: null };
  }
}

export async function PATCH(request: Request) {
  try {
    const { fields, avatar } = await readPatchRequest(request);
    const parsed = profileUpdateSchema.safeParse(fields);
    if (!parsed.success) {
      return fail(
        400,
        "VALIDATION_ERROR",
        "Profile details are invalid",
        validationDetails(parsed.error),
      );
    }

    if (avatar) {
      validateProfilePhoto(avatar);
    }

    const profile = await updateCurrentProfile(parsed.data, avatar);
    return ok({ profile });
  } catch (error) {
    return handleRouteError(error);
  }
}
