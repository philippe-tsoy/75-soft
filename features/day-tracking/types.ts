import type {
  CalendarCellDTO,
  ContainerDTO,
  DayRollupDTO,
  DailyBoardDTO,
  GoalDotState,
  RequiredGoalKey,
} from "@/lib/types";

export interface DayRollupRpc extends DayRollupDTO {}

export interface DayMutationRpc {
  day: DayRollupDTO;
  deltaId: string;
  idempotent: boolean;
}

export interface DailyBoardScoreRpc extends DailyBoardDTO {
  eligible: boolean;
}

export interface DailyBoardEntryRpc {
  rank: number;
  userId: string;
  scoreDate: string;
  goalsAchievedToday: number;
  goalStates: GoalDotState;
}

export interface DayAmountInput {
  goal: "workout" | "water" | "reading";
  amount: number;
  unit?: "minutes" | "ml" | "l" | "pages";
  clientOperationId: string;
}

export interface DayContainerInput {
  goal: "water";
  containerId: string;
  clientOperationId: string;
}

export interface DietToggleInput {
  clientOperationId: string;
}

export interface DayTrackingReadService {
  getDayRollup(
    userId: string,
    localDate: string,
    asOfInstant?: Date | string,
  ): Promise<DayRollupDTO>;
  getCalendar(
    userId: string,
    fromDate: string,
    toDate: string,
    asOfInstant?: Date | string,
  ): Promise<CalendarCellDTO[]>;
  getDailyBoardScore(
    userId: string,
    asOfInstant?: Date | string,
  ): Promise<DailyBoardScoreRpc>;
}

export type DayEntryInput = DayAmountInput | DayContainerInput;

export interface DayTrackingMutationService {
  addAmount(
    userId: string,
    localDate: string,
    input: DayEntryInput,
  ): Promise<{ deltaId: string; idempotent: boolean }>;
  toggleDiet(
    userId: string,
    localDate: string,
    input: DietToggleInput,
  ): Promise<{ deltaId: string; idempotent: boolean }>;
}

export interface ContainerCreateInput {
  label: string;
  volumeMl: number;
}

export interface ContainerUpdateInput {
  label?: string;
  volumeMl?: number;
  sortOrder?: number;
}

export interface ContainerMutationService {
  listContainers(userId: string): Promise<ContainerDTO[]>;
  createContainer(
    userId: string,
    input: ContainerCreateInput,
  ): Promise<ContainerDTO>;
  updateContainer(
    userId: string,
    containerId: string,
    input: ContainerUpdateInput,
  ): Promise<ContainerDTO>;
  deleteContainer(userId: string, containerId: string): Promise<void>;
}

export type { CalendarCellDTO, ContainerDTO, DayRollupDTO, RequiredGoalKey };
