import type {
  AchievementDTO,
  CommentDTO,
  DayRollupDTO,
  OptionalGoalDTO,
  PostDTO,
  ProfileDTO,
} from "@/lib/types";

import type {
  CommentRow,
  FeedPostRow,
  PostGoalEntryRow,
  ProfileRow,
  ReactionRow,
} from "./database";

export interface FeedCursor {
  createdAt: string;
  id: string;
}

export interface FeedPage {
  data: PostDTO[];
  nextCursor: string | null;
}

export interface FeedAuthor {
  row: ProfileRow;
  dto: ProfileDTO;
}

export interface HydratedPost {
  row: FeedPostRow;
  entries: PostGoalEntryRow[];
  reactions: ReactionRow[];
  comments: CommentRow[];
  author: FeedAuthor;
  commentAuthors: Map<string, ProfileDTO>;
  photoUrl: string | null;
}

export interface FeedScoringAdapter {
  getDayRollup(userId: string, localDate: string): Promise<DayRollupDTO | null>;
  afterPostPublished(input: {
    postId: string;
    userId: string;
    localDate: string;
    hasPhoto: boolean;
  }): Promise<AchievementDTO[]>;
  afterPostDeleted(input: {
    postId: string;
    userId: string;
    localDate: string;
  }): Promise<void>;
}

export interface CreatePostResult {
  post: PostDTO;
  day: DayRollupDTO | null;
  newAchievements: AchievementDTO[];
  idempotent: boolean;
}

export interface DeletePostResult {
  day: DayRollupDTO | null;
}

export interface ReactionResult {
  postId: string;
  emoji: string;
}

export interface OwnedOptionalGoal extends OptionalGoalDTO {
  mode: "checkbox" | "numeric";
}

export interface CommentResult {
  comment: CommentDTO;
  idempotent: boolean;
}
