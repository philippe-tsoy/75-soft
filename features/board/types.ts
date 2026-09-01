import type {
  BoardEntryDTO,
  CalendarCellDTO,
  DayRollupDTO,
  GoalDotState,
  ProfileDTO,
} from "@/lib/types";

export interface GroupStripEntryDTO {
  user: ProfileDTO;
  localDate: string;
  dayNumber: number;
  goalDots: GoalDotState;
  goalsAchievedToday: number;
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
  goalsAchievedToday: number;
  individualPct: number;
  calendar: CalendarCellDTO[];
  currentDay: DayRollupDTO;
  achievements: import("@/lib/types").AchievementDTO[];
  posts: import("@/lib/types").PostDTO[];
  canEdit: boolean;
}
