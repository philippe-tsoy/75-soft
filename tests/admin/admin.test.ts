import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/http";
import { createInviteRecord, decryptInviteCode } from "@/features/admin/invite";
import { INVALIDATED_GOAL_STATES } from "@/features/admin/types";
import { hashInviteCode } from "@/features/auth/invite-intent";
import { requireAdmin } from "@/lib/auth/access";
import {
  invalidateAdminMemberDay,
  listAdminMembers,
} from "@/features/admin/service";
import { GET as getMembers } from "@/app/api/admin/members/route";
import { POST as invalidateDay } from "@/app/api/admin/members/[userId]/invalidate-day/route";

vi.mock("@/lib/auth/access", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/features/admin/service", () => ({
  invalidateAdminMemberDay: vi.fn(),
  listAdminMembers: vi.fn(),
}));

describe("admin authorization and invalidation contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call the member read when the fresh admin check is denied", async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(
      new HttpError(403, "FORBIDDEN", "Administrator access is required"),
    );

    const response = await getMembers(
      new Request("http://localhost/api/admin/members"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Administrator access is required",
      },
    });
    expect(vi.mocked(listAdminMembers)).not.toHaveBeenCalled();
  });

  it("returns active members only after the admin check succeeds", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: "admin" },
      membership: {
        cohortId: "cohort",
        userId: "admin",
        role: "admin",
        joinLocalDate: "2026-09-01",
      },
    } as never);
    vi.mocked(listAdminMembers).mockResolvedValue([
      {
        id: "member",
        displayName: "Member",
        avatarUrl: null,
        timezone: "America/New_York",
        role: "member",
        joinedAt: "2026-09-01T12:00:00.000Z",
        joinLocalDate: "2026-09-01",
      },
    ]);

    const response = await getMembers(
      new Request("http://localhost/api/admin/members"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        expect.objectContaining({
          id: "member",
          displayName: "Member",
          role: "member",
        }),
      ],
    });
  });

  it("passes a trimmed, validated local date and reason to invalidation", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined as never);
    vi.mocked(invalidateAdminMemberDay).mockResolvedValue({
      userId: "00000000-0000-0000-0000-000000000002",
      localDate: "2026-09-02",
      kind: "invalidated",
      reason: "Manual review",
      createdBy: "00000000-0000-0000-0000-000000000001",
      createdAt: "2026-09-02T12:00:00.000Z",
      forcedGoalStates: { ...INVALIDATED_GOAL_STATES },
      dailyBoardScore: 0,
      postsRemainVisible: true,
    });

    const response = await invalidateDay(
      new Request("http://localhost/api/admin/members/member/invalidate-day", {
        method: "POST",
        body: JSON.stringify({
          localDate: "2026-09-02",
          reason: "  Manual review  ",
        }),
      }),
      {
        params: Promise.resolve({
          userId: "00000000-0000-0000-0000-000000000002",
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(vi.mocked(invalidateAdminMemberDay)).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000002",
      {
        localDate: "2026-09-02",
        reason: "Manual review",
      },
    );
  });

  it("rejects malformed invalidation input before reaching the mutation", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined as never);

    const response = await invalidateDay(
      new Request("http://localhost/api/admin/members/member/invalidate-day", {
        method: "POST",
        body: JSON.stringify({ localDate: "not-a-date" }),
      }),
      {
        params: Promise.resolve({
          userId: "00000000-0000-0000-0000-000000000002",
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(vi.mocked(invalidateAdminMemberDay)).not.toHaveBeenCalled();
  });
});

describe("admin migration audit and invalidation hooks", () => {
  const migration = readFileSync(
    join(process.cwd(), "database", "migrations", "0007_admin.sql"),
    "utf8",
  );

  it("invalidates prior signup intents and uses database-side admin guards", () => {
    expect(migration).toContain("add column if not exists invalidated_at");
    expect(migration).toMatch(
      /update public\.signup_intents[\s\S]*set invalidated_at/,
    );
    expect(migration).toContain("private.assert_admin()");
    expect(migration).toContain(
      "create table if not exists public.day_overrides",
    );
  });

  it("audits every supported administrator mutation without storing invite values", () => {
    for (const action of [
      "invite_rotated",
      "day_invalidated",
      "member_removed",
      "post_deleted_by_admin",
      "comment_deleted_by_admin",
    ]) {
      expect(migration).toContain(`'${action}'`);
    }

    expect(migration).not.toContain("'code', p_code");
    expect(migration).not.toContain("'inviteCode',");
  });
});

describe("admin invite storage contract", () => {
  it("uses the auth invite digest and keeps the clear code decryptable", () => {
    const record = createInviteRecord("a".repeat(32));

    expect(record.codeDigest).toBe(hashInviteCode(record.code));
    expect(decryptInviteCode(record.codeCiphertext, "a".repeat(32))).toBe(
      record.code,
    );
    expect(record.codeCiphertext).not.toContain(record.code);
  });
});
