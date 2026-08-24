import { createHash, randomBytes } from "node:crypto";
import type { Types } from "mongoose";

import {
  TOKEN_TYPE,
  VerificationToken,
  type TokenType,
} from "@/models/VerificationToken";

/**
 * Issuing and redeeming the single-use links that go out by email.
 */

/** How long each kind of link stays good for. */
const LIFETIME_MS: Record<TokenType, number> = {
  // Long enough to survive a weekend and a spam folder.
  [TOKEN_TYPE.INVITE]: 7 * 24 * 60 * 60 * 1000,
  // Short on purpose: a reset link sitting in an inbox is a live key to the
  // account, and unlike an invite it can be re-requested in seconds.
  [TOKEN_TYPE.PASSWORD_RESET]: 60 * 60 * 1000,
};

/**
 * 256 bits, URL-safe. Long enough that guessing is not a threat model, so no
 * rate limit is load-bearing for the token itself.
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a token and returns the raw value - the only time it exists in
 * readable form. Any earlier token of the same kind for the same user is
 * dropped, so a resent invitation invalidates the previous link rather than
 * leaving several live at once.
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
  });

  return { token, expiresAt };
}

export type TokenFailure = "not-found" | "expired" | "used";

/**
 * Looks a token up without spending it - for rendering the "choose a password"
 * page, which must be able to say why a link is dead before asking for input.
 */
export async function inspectToken(
  token: string,
  type: TokenType,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; reason: TokenFailure }
> {
  const record = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    type,
  });

  if (!record) return { ok: false, reason: "not-found" };
  if (record.usedAt) return { ok: false, reason: "used" };
  // Checked explicitly: Mongo's TTL sweeper is periodic, so an expired
  // document can still be sitting here.
  if (record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, userId: String(record.user) };
}

/**
 * Spends a token, atomically.
 *
 * The `usedAt: null` in the filter is what makes this safe: two requests
 * arriving with the same token race on one `findOneAndUpdate`, and only the
 * one that flips the field from null sees a document. The loser gets "used".
 */
export async function consumeToken(
  token: string,
  type: TokenType,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; reason: TokenFailure }
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

  // Nothing matched. Work out which of the three reasons it was, purely so the
  // page can say something useful.
  return inspectToken(token, type) as Promise<{
    ok: false;
    reason: TokenFailure;
  }>;
}

/** Drops every outstanding link for a user - used after a password changes. */
export async function revokeTokens(
  userId: Types.ObjectId | string,
  type?: TokenType,
): Promise<void> {
  await VerificationToken.deleteMany(type ? { user: userId, type } : { user: userId });
}
