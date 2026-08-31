import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const INVITE_INTENT_COOKIE = "75_soft_invite_intent";
export const INVITE_INTENT_TTL_SECONDS = 15 * 60;

export interface SignedInviteIntentPayload {
  v: 1;
  purpose: "invite";
  intentId: string;
  inviteCodeHash: string;
  createdAt: string;
  nonce: string;
  exp: number;
}

export interface CookieWriter {
  cookies: {
    set(
      name: string,
      value: string,
      options: {
        httpOnly: boolean;
        maxAge: number;
        path: string;
        sameSite: "lax";
        secure: boolean;
      },
    ): void;
  };
}

function getSecret(secret?: string): string {
  if (!secret) {
    throw new Error("Invite intent signing secret is not configured");
  }

  return secret;
}

function encodePayload(payload: object): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function signPayload(payload: object, secret: string): string {
  const encodedPayload = encodePayload(payload);
  const signature = createHmac("sha256", getSecret(secret))
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function hasValidSignature(
  encodedPayload: string,
  signature: string,
  secret: string,
) {
  const expected = createHmac("sha256", getSecret(secret))
    .update(encodedPayload)
    .digest();
  const received = Buffer.from(signature, "base64url");

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidCommonPayload(
  value: unknown,
  purpose: "invite",
  now: number,
): value is Record<string, unknown> & {
  v: 1;
  purpose: "invite";
  createdAt: string;
  nonce: string;
  exp: number;
} {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.v === 1 &&
    value.purpose === purpose &&
    typeof value.createdAt === "string" &&
    typeof value.nonce === "string" &&
    value.nonce.length >= 16 &&
    typeof value.exp === "number" &&
    Number.isSafeInteger(value.exp) &&
    value.exp >= now
  );
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function hashInviteCode(code: string): string {
  return createHash("sha256")
    .update(normalizeInviteCode(code), "utf8")
    .digest("hex");
}

export function hashEmail(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex");
}

export function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}

function isFreshDate(value: string, now: number): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= now;
}

export function isInviteIntentRecordUsable(
  record: {
    invite_digest: string;
    nonce_digest: string;
    expires_at: string;
    consumed_at: string | null;
    invalidated_at?: string | null;
  },
  payload: Pick<SignedInviteIntentPayload, "inviteCodeHash" | "nonce" | "exp">,
  now = Date.now(),
): boolean {
  return (
    record.consumed_at === null &&
    record.invalidated_at == null &&
    record.invite_digest === payload.inviteCodeHash &&
    record.nonce_digest === hashNonce(payload.nonce) &&
    payload.exp >= now &&
    isFreshDate(record.expires_at, now)
  );
}

export function createInviteIntentPayload(input: {
  intentId: string;
  inviteCodeHash: string;
  now?: Date;
  ttlSeconds?: number;
}): SignedInviteIntentPayload {
  const now = input.now ?? new Date();
  const ttlSeconds = input.ttlSeconds ?? INVITE_INTENT_TTL_SECONDS;

  return {
    v: 1,
    purpose: "invite",
    intentId: input.intentId,
    inviteCodeHash: input.inviteCodeHash,
    createdAt: now.toISOString(),
    nonce: randomBytes(24).toString("base64url"),
    exp: now.getTime() + ttlSeconds * 1_000,
  };
}

export function signInviteIntent(
  payload: SignedInviteIntentPayload,
  secret: string,
): string {
  return signPayload(payload, secret);
}

export function verifyInviteIntent(
  token: string,
  secret: string,
  now = Date.now(),
): SignedInviteIntentPayload | null {
  const [encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length > 0) {
    return null;
  }

  try {
    if (!hasValidSignature(encodedPayload, signature, secret)) {
      return null;
    }

    const payload = decodePayload(encodedPayload);
    if (!isValidCommonPayload(payload, "invite", now) || !isRecord(payload)) {
      return null;
    }

    if (
      typeof payload.intentId !== "string" ||
      !payload.intentId ||
      typeof payload.inviteCodeHash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(payload.inviteCodeHash)
    ) {
      return null;
    }

    return payload as unknown as SignedInviteIntentPayload;
  } catch {
    return null;
  }
}

export function setInviteIntentCookie(
  response: CookieWriter,
  token: string,
): void {
  response.cookies.set(INVITE_INTENT_COOKIE, token, {
    httpOnly: true,
    maxAge: INVITE_INTENT_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearInviteIntentCookie(response: CookieWriter): void {
  response.cookies.set(INVITE_INTENT_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
