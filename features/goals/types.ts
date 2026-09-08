import type { GoalDTO } from "@/lib/types";

export type GoalCreateInput = {
  name: string;
  targetValue?: number | null;
  unit?: string | null;
  isPrivate?: boolean;
  templateId?: string | null;
};

export type GoalPatchInput = {
  name?: string;
  targetValue?: number | null;
  unit?: string | null;
  isPrivate?: boolean;
  /** One-way: archiving is the only transition a member can make here. */
  active?: false;
};

export type { GoalDTO };
