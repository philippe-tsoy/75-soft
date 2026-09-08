import type {
  BoardEntryDTO,
  CalendarCellDTO,
  DayRollupDTO,
  ProfileDTO,
} from "@/lib/types";

export interface GroupStripEntryDTO {
  user: ProfileDTO;
  localDate: string;
  dayNumber: number;
  metCount: number;
  totalCount: number;
  scoreDate: string;
}

export interface BoardReadModel {
  entries: BoardEntryDTO[];
}

export interface BoardRpcRow {
  [key: string]: unknown;
}

export interface PersonReadModel {
  profile: ProfileDTO;
  metCount: number;
  totalCount: number;
  individualPct: number;
  calendar: CalendarCellDTO[];
  currentDay: DayRollupDTO;
  achievements: import("@/lib/types").AchievementDTO[];
  posts: import("@/lib/types").PostDTO[];
  canEdit: boolean;
}
