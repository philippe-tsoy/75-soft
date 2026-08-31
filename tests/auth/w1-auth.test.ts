import { describe, expect, it } from "vitest";

import {
  createInviteIntentPayload,
  createOAuthStatePayload,
  hashInviteCode,
  hashNonce,
  isInviteIntentRecordUsable,
  signInviteIntent,
  signOAuthState,
  verifyInviteIntent,
  verifyOAuthState,
} from "@/features/auth/invite-intent";
import {
  isAllowedInternalPath,
  safeInternalRedirect,
} from "@/features/auth/redirects";

const secret = "test-secret-that-is-long-enough-for-signing";
const now = new Date("2026-08-30T22:00:00.000Z");

describe("W1 invite and redirect boundaries", () => {
  it("normalizes invite codes the same way for validation and rotation", () => {
    expect(hashInviteCode("  reusable-code  ")).toBe(
      hashInviteCode("REUSABLE-CODE"),
    );
  });

  it("accepts a signed invite intent and rejects tampering", () => {
    const payload = createInviteIntentPayload({
      intentId: "intent-1",
      inviteCodeHash: hashInviteCode("REUSABLE-CODE"),
      now,
    });
    const token = signInviteIntent(payload, secret);

    expect(verifyInviteIntent(token, secret, now.getTime())).toMatchObject({
      intentId: "intent-1",
      inviteCodeHash: hashInviteCode("REUSABLE-CODE"),
    });
    expect(
      verifyInviteIntent(`${token}tampered`, secret, now.getTime()),
    ).toBeNull();
  });

  it("rejects stale and already-consumed invite attempts", () => {
    const payload = createInviteIntentPayload({
      intentId: "intent-2",
      inviteCodeHash: hashInviteCode("REUSABLE-CODE"),
      now,
      ttlSeconds: 1,
    });
    const record = {
      invite_digest: payload.inviteCodeHash,
      nonce_digest: "not-the-right-digest",
      expires_at: new Date(payload.exp).toISOString(),
      consumed_at: null,
    };

    expect(isInviteIntentRecordUsable(record, payload, now.getTime())).toBe(
      false,
    );
    expect(
      isInviteIntentRecordUsable(
        {
          ...record,
          nonce_digest: hashNonce(payload.nonce),
        },
        payload,
        now.getTime() + 1_001,
      ),
    ).toBe(false);
    expect(
      isInviteIntentRecordUsable(
        {
          ...record,
          invite_digest: hashInviteCode("ROTATED-CODE"),
          nonce_digest: hashNonce(payload.nonce),
        },
        payload,
        now.getTime(),
      ),
    ).toBe(false);
    expect(
      isInviteIntentRecordUsable(
        {
          ...record,
          nonce_digest: hashNonce(payload.nonce),
          consumed_at: now.toISOString(),
        },
        payload,
        now.getTime(),
      ),
    ).toBe(false);
    expect(
      isInviteIntentRecordUsable(
        {
          ...record,
          nonce_digest: hashNonce(payload.nonce),
          invalidated_at: now.toISOString(),
        },
        payload,
        now.getTime(),
      ),
    ).toBe(false);
  });

  it("binds OAuth state to the invite nonce and expiry", () => {
    const payload = createOAuthStatePayload({
      inviteIntentId: "intent-3",
      inviteCodeHash: hashInviteCode("REUSABLE-CODE"),
      nonce: "nonce-that-is-long-enough",
      now,
    });
    const token = signOAuthState(payload, secret);

    expect(verifyOAuthState(token, secret, now.getTime())).toMatchObject({
      inviteIntentId: "intent-3",
      nonce: "nonce-that-is-long-enough",
    });
    expect(
      verifyOAuthState(token, secret, now.getTime() + 15 * 60 * 1_000 + 1),
    ).toBeNull();
  });

  it("allows only safe internal redirect paths", () => {
    expect(isAllowedInternalPath("/today")).toBe(true);
    expect(isAllowedInternalPath("/person/user-1?tab=calendar")).toBe(true);
    expect(safeInternalRedirect("/today?from=login")).toBe("/today?from=login");
    expect(safeInternalRedirect("https://evil.example/phish")).toBe("/today");
    expect(safeInternalRedirect("//evil.example/phish")).toBe("/today");
    expect(safeInternalRedirect("/today\\evil")).toBe("/today");
    expect(safeInternalRedirect("/administer")).toBe("/today");
  });
});
