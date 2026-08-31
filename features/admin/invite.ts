import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { getServerEnv } from "@/lib/config/env";
import { hashInviteCode as hashAuthInviteCode } from "@/features/auth/invite-intent";

const INVITE_CODE_PREFIX = "75SOFT";
const INVITE_CIPHER_VERSION = "v1";
const INVITE_CIPHER_ALGORITHM = "aes-256-gcm";
const INVITE_IV_BYTES = 12;
const INVITE_CODE_BYTES = 18;

export interface InviteRecord {
  code: string;
  codeDigest: string;
  codeCiphertext: string;
  codeHint: string;
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function getInviteSecret(): string {
  return getServerEnv().INVITE_INTENT_SECRET;
}

export function generateInviteCode(): string {
  return `${INVITE_CODE_PREFIX}-${randomBytes(INVITE_CODE_BYTES)
    .toString("hex")
    .toUpperCase()}`;
}

export function digestInviteCode(code: string): string {
  // W1 owns invite validation. Keep rotation on its canonical SHA-256 digest
  // so a newly rotated code is accepted by the existing signup flow.
  return hashAuthInviteCode(normalizeInviteCode(code));
}

function deriveEncryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function encodeBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

export function encryptInviteCode(
  code: string,
  secret = getInviteSecret(),
): string {
  const iv = randomBytes(INVITE_IV_BYTES);
  const cipher = createCipheriv(
    INVITE_CIPHER_ALGORITHM,
    deriveEncryptionKey(secret),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(normalizeInviteCode(code), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    INVITE_CIPHER_VERSION,
    encodeBase64Url(iv),
    encodeBase64Url(authTag),
    encodeBase64Url(ciphertext),
  ].join(".");
}

export function decryptInviteCode(
  ciphertext: string,
  secret = getInviteSecret(),
): string {
  const [version, encodedIv, encodedAuthTag, encodedValue] =
    ciphertext.split(".");

  if (
    version !== INVITE_CIPHER_VERSION ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedValue
  ) {
    throw new Error("Unsupported invite ciphertext");
  }

  const iv = Buffer.from(encodedIv, "base64url");
  const authTag = Buffer.from(encodedAuthTag, "base64url");
  const value = Buffer.from(encodedValue, "base64url");

  if (iv.length !== INVITE_IV_BYTES || authTag.length !== 16 || !value.length) {
    throw new Error("Invalid invite ciphertext");
  }

  const decipher = createDecipheriv(
    INVITE_CIPHER_ALGORITHM,
    deriveEncryptionKey(secret),
    iv,
  );
  decipher.setAuthTag(authTag);

  return normalizeInviteCode(
    Buffer.concat([decipher.update(value), decipher.final()]).toString("utf8"),
  );
}

export function createInviteRecord(secret = getInviteSecret()): InviteRecord {
  const code = generateInviteCode();

  return {
    code,
    codeDigest: digestInviteCode(code),
    codeCiphertext: encryptInviteCode(code, secret),
    codeHint: `••••${code.slice(-4)}`,
  };
}

export function buildInviteLink(code: string, origin?: string): string {
  const base = origin?.replace(/\/+$/, "") ?? "";
  return `${base}/invite?code=${encodeURIComponent(normalizeInviteCode(code))}`;
}
