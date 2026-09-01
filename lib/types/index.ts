import { REQUIRED_GOAL_KEYS } from "@/lib/config/75-soft";

export type RequiredGoalKey = (typeof REQUIRED_GOAL_KEYS)[number];
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

export type GoalDotState = Record<RequiredGoalKey, boolean>;

export interface ProfileDTO {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  timezone?: string;
  role?: MembershipRole;
}

export interface GoalProgressDTO {
  amount?: number;
  target?: number;
  unit?: "minutes" | "ml" | "pages" | "attestation";
  met: boolean;
}

export interface DayRollupDTO {
  localDate: string;
  dayNumber: number;
  status: DayDisplayState;
  editable: boolean;
  invalidated: boolean;
  goals: {
    workout: GoalProgressDTO;
    water: GoalProgressDTO;
    reading: GoalProgressDTO;
    diet: GoalProgressDTO;
  };
  metCount: number;
}

export interface DailyBoardDTO {
  scoreDate: string;
  goalsAchievedToday: number;
  goalStates: GoalDotState;
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

export interface OptionalGoalDTO {
  id: string;
  name: string;
  targetValue: number | null;
  unit: string | null;
  active: boolean;
}

export type PostGoalDTO =
  | {
      kind: "required";
      key: RequiredGoalKey;
      amount: number | null;
      unit: string | null;
      met: boolean;
    }
  | {
      kind: "optional";
      optionalGoalId: string;
      name: string;
      value: number | null;
      completed: boolean | null;
    };

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

export interface PostRequiredSnapshotDTO {
  workout: { amount: number; met: boolean };
  water: { amount: number; met: boolean };
  reading: { amount: number; met: boolean };
  diet: { met: boolean };
}

export interface PostDTO {
  id: string;
  author: ProfileDTO;
  localDate: string;
  createdAt: string;
  goals: PostGoalDTO[];
  note: string | null;
  photoUrl: string | null;
  requiredSnapshot: PostRequiredSnapshotDTO;
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
  goalsAchievedToday: number;
  scoreDate: string;
}

export interface TeamBoardEntryDTO {
  rank: number;
  teamId: string;
  name: string;
  memberCount: number;
  pct: number;
}

export interface TeamRosterMemberDTO {
  userId: string;
  profile: ProfileDTO;
  individualPct: number;
  goalsAchievedToday: number;
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
