import type { CalendarCellDTO, ContainerDTO, DayRollupDTO } from "@/lib/types";

export interface DayRollupRpc extends DayRollupDTO {}

export interface DayMutationRpc {
  day: DayRollupDTO;
  deltaId: string;
  idempotent: boolean;
}

export interface DailyBoardScoreRpc {
  scoreDate: string;
  metCount: number;
  totalCount: number;
  eligible: boolean;
}

export interface DailyBoardEntryRpc {
  rank: number;
  userId: string;
  scoreDate: string;
  metCount: number;
  totalCount: number;
}

export interface DayAmountInput {
  goalId: string;
  amount: number;
  unit?: string;
  clientOperationId: string;
}

export interface DayContainerInput {
  goalId: string;
  containerId: string;
  clientOperationId: string;
}

export interface GoalDoneToggleInput {
  goalId: string;
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
  toggleGoalDone(
    userId: string,
    localDate: string,
    input: GoalDoneToggleInput,
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

export type { CalendarCellDTO, ContainerDTO, DayRollupDTO };
