import type { OptionalGoalDTO } from "@/lib/types";

export type OptionalGoalMode = "checkbox" | "numeric";

export interface OptionalGoalLogDTO {
  id: string;
  optionalGoalId: string;
  localDate: string;
  value: number | null;
  completed: boolean | null;
  clientOperationId: string;
  createdAt: string;
}

export interface OptionalGoalStreakToastDTO {
  optionalGoalId: string;
  goalName: string;
  streakDays: number;
  message: string;
}

export interface OptionalGoalLogResultDTO {
  goal: OptionalGoalDTO;
  log: OptionalGoalLogDTO;
  streakDays: number;
  streakToast: OptionalGoalStreakToastDTO | null;
}

export interface OptionalGoalDailyState {
  localDate: string;
  value: number | null;
  completed: boolean | null;
  met: boolean;
}

export type OptionalGoalCreateInput = {
  name: string;
  targetValue?: number | null;
  unit?: string | null;
};

export type OptionalGoalPatchInput = {
  name?: string;
  targetValue?: number | null;
  unit?: string | null;
  active?: false;
};

export type OptionalGoalLogInput = {
  localDate: string;
  value?: number | null;
  completed?: boolean | null;
  clientOperationId: string;
};

export type OptionalGoalLogValues = Pick<
  OptionalGoalLogInput,
  "localDate" | "value" | "completed" | "clientOperationId"
>;

export type OptionalPostGoalSelection =
  | {
      optionalGoalId: string;
      value: number;
    }
  | {
      optionalGoalId: string;
      completed: boolean;
    };

export type OptionalGoalWithMode = OptionalGoalDTO & {
  mode: OptionalGoalMode;
};
