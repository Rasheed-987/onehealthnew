import bcrypt from "bcryptjs";

/**
 * Password hashing, in one place.
 *
 * Every write of `User.password` goes through `hashPassword` and every sign-in
 * through `verifyPassword`, so the cost factor and the algorithm can be raised
 * later by editing this file alone.
 */

/**
 * bcrypt work factor. 12 is ~250ms on current hardware - slow enough to make
 * offline cracking expensive, fast enough for an interactive login.
 */
const SALT_ROUNDS = 12;

/** Shortest password the app will accept. Enforced here so no caller can skip it. */
export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * `hash` may be undefined when a user document was loaded without the
 * `select: false` password field; treat that as a failed match rather than
 * letting bcrypt throw, so a mis-built query cannot become an auth bypass.
 */
export async function verifyPassword(
  plain: string,
  hash: string | undefined | null,
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}
