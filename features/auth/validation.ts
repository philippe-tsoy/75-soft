import { z } from "zod";

import {
  displayNameSchema,
  profileUpdateSchema,
  timezoneSchema,
} from "@/lib/validation";

export const inviteCodeSchema = z.object({
  code: z.string().trim().min(1).max(256),
});

export const emailSchema = z.string().trim().email();

export const passwordSchema = z.string().min(8).max(128);

export const signupFieldsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  timezone: timezoneSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  next: z.string().optional(),
});

export const passwordResetSchema = z.object({
  email: emailSchema,
});

export const passwordUpdateSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
});

export const profileCompletionSchema = z.object({
  displayName: displayNameSchema,
  timezone: timezoneSchema,
});

export { profileUpdateSchema };

export function validationDetails(error: z.ZodError): Record<string, unknown> {
  const fields = error.issues.reduce<Record<string, string[]>>(
    (result, issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "form";
      result[field] ??= [];
      result[field].push(issue.message);
      return result;
    },
    {},
  );

  return { fields };
}

export function getFormString(
  formData: FormData,
  name: string,
): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export function getFormFile(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  return value instanceof File ? value : null;
}
