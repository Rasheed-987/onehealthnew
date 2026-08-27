import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Types } from "mongoose";

import {
  TOKEN_TYPE,
  VerificationToken,
  type TokenType,
} from "@/models/VerificationToken";

/**
 * Issuing and redeeming the single-use links and OTP codes that go out by email.
 */

/** How long each kind of token/link stays good for. */
const LIFETIME_MS: Record<TokenType, number> = {
  // Long enough to survive a weekend and a spam folder.
  [TOKEN_TYPE.INVITE]: 7 * 24 * 60 * 60 * 1000,
  // Short on purpose for OTPs: 10 minutes.
  [TOKEN_TYPE.PASSWORD_RESET]: 10 * 60 * 1000,
};

/** MAX invalid OTP attempts before token is locked out */
export const MAX_OTP_ATTEMPTS = 5;

/**
 * 256 bits, URL-safe. Long enough that guessing is not a threat model.
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 6-digit numeric OTP code */
export function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Checks whether an unspent, unexpired token/OTP was issued for this user
 * within the specified cooldown period (default 60 seconds).
 */
export async function hasRecentToken(
  userId: Types.ObjectId | string,
  type: TokenType,
  cooldownMs = 60 * 1000,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownMs);
  const recent = await VerificationToken.findOne({
    user: userId,
    type,
    usedAt: null,
    createdAt: { $gte: cutoff },
    expiresAt: { $gt: new Date() },
  });
  return !!recent;
}

/**
 * Issues a token and returns the raw value - the only time it exists in
 * readable form. Any earlier token of the same kind for the same user is
 * dropped.
 */
export async function issueToken(
  userId: Types.ObjectId | string,
  type: TokenType,
): Promise<{ token: string; expiresAt: Date }> {
  await VerificationToken.deleteMany({ user: userId, type });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + LIFETIME_MS[type]);

  await VerificationToken.create({
    user: userId,
    tokenHash: hashToken(token),
    type,
    expiresAt,
    attempts: 0,
  });

  return { token, expiresAt };
}

/**
 * Issues a 6-digit numeric OTP code for password reset.
 */
export async function issueOtpToken(
  userId: Types.ObjectId | string,
  type: TokenType = TOKEN_TYPE.PASSWORD_RESET,
): Promise<{ otp: string; expiresAt: Date }> {
  await VerificationToken.deleteMany({ user: userId, type });

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + LIFETIME_MS[type]);

  await VerificationToken.create({
    user: userId,
    tokenHash: hashToken(otp),
    type,
    expiresAt,
    attempts: 0,
  });

  return { otp, expiresAt };
}

export type LinkTokenFailure = "not-found" | "expired" | "used";
export type TokenFailure =
  | LinkTokenFailure
  | "invalid-otp"
  | "too-many-attempts";

/**
 * Looks a token up without spending it.
 */
export async function inspectToken(
  token: string,
  type: TokenType,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; reason: LinkTokenFailure }
> {
  const record = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    type,
  });

  if (!record) return { ok: false, reason: "not-found" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, userId: String(record.user) };
}

/**
 * Spends a token, atomically.
 */
export async function consumeToken(
  token: string,
  type: TokenType,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; reason: LinkTokenFailure }
> {
  const record = await VerificationToken.findOneAndUpdate(
    {
      tokenHash: hashToken(token),
      type,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { new: true },
  );

  if (record) return { ok: true, userId: String(record.user) };

  return inspectToken(token, type) as Promise<{
    ok: false;
    reason: LinkTokenFailure;
  }>;
}

/**
 * Verifies a 6-digit OTP code for a user, tracking failed attempts.
 */
export async function verifyAndConsumeOtp(
  userId: Types.ObjectId | string,
  otp: string,
  type: TokenType = TOKEN_TYPE.PASSWORD_RESET,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; reason: TokenFailure; remainingAttempts?: number }
> {
  const record = await VerificationToken.findOne({
    user: userId,
    type,
    usedAt: null,
  });

  if (!record) {
    return { ok: false, reason: "not-found" };
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const currentAttempts = record.attempts ?? 0;

  if (currentAttempts >= MAX_OTP_ATTEMPTS) {
    // Revoke token immediately
    await VerificationToken.deleteOne({ _id: record._id });
    return { ok: false, reason: "too-many-attempts" };
  }

  const inputHash = hashToken(otp.trim());
  if (inputHash === record.tokenHash) {
    record.usedAt = new Date();
    await record.save();
    return { ok: true, userId: String(record.user) };
  }

  // Mismatch: increment attempt count
  const newAttempts = currentAttempts + 1;
  record.attempts = newAttempts;

  if (newAttempts >= MAX_OTP_ATTEMPTS) {
    await VerificationToken.deleteOne({ _id: record._id });
    return { ok: false, reason: "too-many-attempts", remainingAttempts: 0 };
  }

  await record.save();
  return {
    ok: false,
    reason: "invalid-otp",
    remainingAttempts: MAX_OTP_ATTEMPTS - newAttempts,
  };
}

/** Drops every outstanding link/OTP for a user - used after a password changes. */
export async function revokeTokens(
  userId: Types.ObjectId | string,
  type?: TokenType,
): Promise<void> {
  await VerificationToken.deleteMany(
    type ? { user: userId, type } : { user: userId },
  );
}
