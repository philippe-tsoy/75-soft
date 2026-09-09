export type MembershipRole = "member" | "admin";
export type PostStatus = "pending" | "published" | "deleted" | "failed";
export type DayDisplayState =
  | "unscored"
  | "future"
  | "open"
  | "in_progress"
  | "partial"
  | "complete"
  | "missed";

export interface ProfileDTO {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  timezone?: string;
  role?: MembershipRole;
}

/**
 * How a member logs their goal amounts on the day tracker: a drag slider
 * that runs 0 -> target, or the − / + button steppers.
 */
export type AmountInputMode = "slider" | "buttons";

export const DEFAULT_AMOUNT_INPUT_MODE: AmountInputMode = "slider";

export interface GoalProgressDTO {
  id: string;
  /** "Secret goal" when isPrivate is true and the viewer isn't the owner. */
  name: string;
  isPrivate: boolean;
  amount?: number;
  target?: number;
  unit?: string | null;
  met: boolean;
  /**
   * Manually toggled "done" state for a numeric goal, independent of
   * amount vs. target. `met` already folds this in; this is exposed
   * separately so the UI can show the toggle's own state.
   */
  markedDone?: boolean;
}

export interface DayRollupDTO {
  localDate: string;
  dayNumber: number;
  status: DayDisplayState;
  editable: boolean;
  invalidated: boolean;
  /** Every goal the member had active on this date. */
  goals: GoalProgressDTO[];
  metCount: number;
  totalCount: number;
}

export interface DailyBoardDTO {
  scoreDate: string;
  metCount: number;
  totalCount: number;
}

export interface CalendarCellDTO {
  localDate: string;
  dayNumber: number;
  status: DayDisplayState;
  metCount: number;
  editable: boolean;
  invalidated: boolean;
}

export interface ContainerDTO {
  id: string;
  label: string;
  volumeMl: number;
  sortOrder: number;
}

export interface GoalDTO {
  id: string;
  name: string;
  targetValue: number | null;
  unit: string | null;
  isPrivate: boolean;
  active: boolean;
  templateId: string | null;
}

export interface GoalTemplateDTO {
  id: string;
  name: string;
  targetValue: number | null;
  unit: string | null;
}

export interface GoalTemplateAdminDTO extends GoalTemplateDTO {
  active: boolean;
}

export interface PostGoalDTO {
  /** Null for a goal that no longer exists; the snapshot below survives it. */
  goalId: string | null;
  /** The goal's real name, or "Secret goal" if it was private at post time. */
  name: string;
  amount: number | null;
  met: boolean;
}

export interface ReactionSummaryDTO {
  emoji: string;
  count: number;
  reactedByViewer: boolean;
}

export interface CommentDTO {
  id: string;
  author: ProfileDTO;
  body: string;
  createdAt: string;
  canDelete: boolean;
}

export interface PostDTO {
  id: string;
  author: ProfileDTO;
  localDate: string;
  createdAt: string;
  goals: PostGoalDTO[];
  note: string | null;
  photoUrl: string | null;
  teamId: string | null;
  reactions: ReactionSummaryDTO[];
  comments: CommentDTO[];
  canDelete: boolean;
}

export interface AchievementDTO {
  code: string;
  title: string;
  description: string;
  isHidden: boolean;
  unlockedAt: string | null;
}

export interface BoardEntryDTO {
  rank: number;
  user: ProfileDTO;
  metCount: number;
  totalCount: number;
  scoreDate: string;
}

export interface TeamBoardEntryDTO {
  rank: number;
  teamId: string;
  name: string;
  memberCount: number;
  pct: number;
}

export interface MemberGoalStatDTO {
  goalId: string;
  /** "Secret goal" for a goal that was private at any point in its history. */
  name: string;
  isPrivate: boolean;
  active: boolean;
  metDays: number;
  eligibleDays: number;
  pct: number;
}

export interface MemberStatsDTO {
  dayNumber: number;
  metDays: number;
  eligibleDays: number;
  pct: number;
  goals: MemberGoalStatDTO[];
}

export interface TeamRosterMemberDTO {
  userId: string;
  profile: ProfileDTO;
  individualPct: number;
  metCount: number;
  totalCount: number;
}

export interface TeamSummaryDTO {
  teamId: string;
  name: string;
  createdBy: string;
  memberCount: number;
  pct: number;
  roster: TeamRosterMemberDTO[];
}

export interface MyTeamDTO {
  teamId: string;
  name: string;
  individualPct: number;
  teamPct: number;
}

export interface SessionDTO {
  authenticated: boolean;
  member: boolean;
  user: ProfileDTO | null;
  role: MembershipRole | null;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
