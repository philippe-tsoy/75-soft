import { getImageExtension, validateImage } from "@/lib/storage";
import {
  COHORT_START_DATE,
  MAX_NOTE_CHARACTERS,
  POST_PHOTO_MIME_TYPES,
} from "@/lib/config/75-soft";
import { getYesterday, isEditableDate, isValidISODate } from "@/lib/dates";
import {
  CLIENT_OPERATION_ID_HEADER,
  requireClientOperationId,
} from "@/lib/idempotency";
import { HttpError } from "@/lib/http";
import {
  commentBodySchema,
  graphemeLength,
  isoDateSchema,
  noteSchema,
  operationIdSchema,
  postGoalInputSchema,
  positiveAmountSchema,
  reactionPaletteSchema,
  isSingleEmoji,
} from "@/lib/validation";
import type { PostGoalInput } from "./validation-types";

export interface ParsedPostForm {
  localDate: string;
  goals: PostGoalInput[];
  note: string | null;
  photo: File;
  clientOperationId: string;
}

function validationError(
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new HttpError(400, "VALIDATION_ERROR", message, details);
}

function formString(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    validationError(`${field} must be text`);
  }

  return value;
}

function parseOperationId(request: Request, formData: FormData): string {
  const headerValue = request.headers.get(CLIENT_OPERATION_ID_HEADER);
  const fieldValue = formData.get("clientOperationId");

  let operationId: string;
  if (headerValue !== null) {
    operationId = requireClientOperationId(request);
  } else if (typeof fieldValue === "string") {
    const parsed = operationIdSchema.safeParse(fieldValue);
    if (!parsed.success) {
      validationError("clientOperationId must be a UUID");
    }
    operationId = parsed.data;
  } else {
    validationError("clientOperationId is required");
  }

  if (typeof fieldValue === "string" && fieldValue !== operationId) {
    validationError("clientOperationId values must match");
  }

  return operationId;
}

function parseGoals(formData: FormData): PostGoalInput[] {
  const rawGoals = formString(formData, "goals");
  if (!rawGoals) {
    // Optional-goal selection is the only thing left in this field; an empty
    // post is still meaningful once every required goal is met and a photo
    // is attached, so an absent/empty value is not an error.
    return [];
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawGoals);
  } catch {
    validationError("goals must be valid JSON");
  }

  const parsed = postGoalInputSchema.safeParse(decoded);
  if (!parsed.success) {
    validationError("The selected goals are invalid", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  }

  return parsed.data;
}

function parseNote(formData: FormData): string | null {
  const rawNote = formString(formData, "note");
  const parsed = noteSchema.safeParse(rawNote === "" ? null : rawNote);
  if (!parsed.success) {
    validationError(`Note must be ${MAX_NOTE_CHARACTERS} characters or fewer`);
  }

  return parsed.data ?? null;
}

function parsePhoto(formData: FormData): File {
  const value = formData.get("photo");
  if (value === null) {
    validationError("A photo is required to post an update");
  }

  if (typeof value === "string") {
    validationError("photo must be an image file");
  }

  const validation = validateImage(value, POST_PHOTO_MIME_TYPES);
  if (!validation.valid) {
    if (validation.error === "too_large") {
      throw new HttpError(
        413,
        "PAYLOAD_TOO_LARGE",
        "Post photos must be 5 MB or smaller",
      );
    }

    if (validation.error === "unsupported_type") {
      throw new HttpError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Post photos must be jpeg, png, or webp",
      );
    }

    validationError("An empty photo cannot be uploaded");
  }

  return value;
}

export function parsePostForm(
  request: Request,
  formData: FormData,
): ParsedPostForm {
  const localDate = formString(formData, "localDate");
  if (!localDate) {
    validationError("localDate is required");
  }

  return {
    localDate,
    goals: parseGoals(formData),
    note: parseNote(formData),
    photo: parsePhoto(formData),
    clientOperationId: parseOperationId(request, formData),
  };
}

export function resolvePostLocalDate(
  assertion: string,
  memberLocalDate: string,
  joinLocalDate: string,
): string {
  const resolved =
    assertion === "today"
      ? memberLocalDate
      : assertion === "yesterday"
        ? getYesterday(memberLocalDate)
        : assertion;

  if (!isValidISODate(resolved)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Use a valid local date");
  }

  if (
    resolved < COHORT_START_DATE ||
    !isEditableDate(resolved, memberLocalDate, joinLocalDate)
  ) {
    throw new HttpError(
      422,
      "BUSINESS_RULE_VIOLATION",
      "Posts can only be added for today or yesterday",
      { localDate: resolved },
    );
  }

  return isoDateSchema.parse(resolved);
}

export function parseRequiredWholeAmount(
  value: number | undefined,
  field: string,
): number {
  const parsed = positiveAmountSchema.safeParse(value);
  if (!parsed.success || !Number.isSafeInteger(parsed.data)) {
    validationError(`${field} must be a positive whole number`);
  }

  return parsed.data;
}

export function parseCommentBody(value: unknown): string {
  const parsed = commentBodySchema.safeParse(value);
  if (!parsed.success) {
    validationError("Comment must contain 1–256 characters", {
      graphemeCount:
        typeof value === "string" ? graphemeLength(value.trim()) : undefined,
    });
  }

  return parsed.data;
}

export function parseReactionEmoji(value: unknown): string {
  if (typeof value !== "string" || !isSingleEmoji(value)) {
    validationError("Reaction must be one emoji");
  }

  return value.trim();
}

export function parseReactionPalette(value: unknown): string[] {
  const parsed = reactionPaletteSchema.safeParse(value);
  if (!parsed.success) {
    validationError("Reaction palette is invalid");
  }

  return parsed.data.emoji;
}

export function parseOptionalOperationId(request: Request): string | null {
  const header = request.headers.get(CLIENT_OPERATION_ID_HEADER);
  if (header === null) {
    return null;
  }

  return requireClientOperationId(request);
}

export function getPhotoExtension(file: File): "jpeg" | "png" | "webp" {
  return getImageExtension(file.type);
}
