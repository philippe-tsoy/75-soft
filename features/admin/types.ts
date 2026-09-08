import type { DayRollupDTO, MembershipRole } from "@/lib/types";

export const ADMIN_INVALIDATION_KIND = "invalidated" as const;

export interface AdminInviteDTO {
  id: string;
  code: string;
  codeHint: string;
  inviteLink: string;
  createdAt: string;
}

export interface AdminMemberDTO {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  timezone: string;
  role: MembershipRole;
  joinedAt: string;
  joinLocalDate: string;
}

export interface AdminInvalidationDTO {
  userId: string;
  localDate: string;
  kind: typeof ADMIN_INVALIDATION_KIND;
  reason: string | null;
  createdBy: string;
  createdAt: string;
  forcedMet: false;
  dailyBoardScore: 0;
  postsRemainVisible: true;
}

export interface AdminRemovalDTO {
  userId: string;
  removedAt: string;
  removedBy: string;
}

export interface AdminModerationDTO {
  id: string;
  deleted: boolean;
  day?: DayRollupDTO | null;
  mediaCleanupPending?: boolean;
}

export interface AdminAuditEntryDTO {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
}

export interface AdminDashboardDTO {
  invite: AdminInviteDTO | null;
  members: AdminMemberDTO[];
  audit: AdminAuditEntryDTO[];
}

export interface AdminInvalidationInput {
  localDate: string;
  reason?: string | null;
}
