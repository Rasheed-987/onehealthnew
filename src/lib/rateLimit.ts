import { ApiError } from "@/lib/api";
import { RateLimit } from "@/models";

/**
 * Throttling for public routes, where there is no account to hang a counter on.
 *
 * `claimCodeRequest` in `tokens.ts` is the same idea keyed on a `User._id`, and
 * this borrows its central trick: the limit lives in the update's own filter,
 * so the check and the increment are one atomic operation and two simultaneous
 * requests cannot both claim the last slot.
 */

/**
 * Takes one slot from `key`'s window, or reports the allowance spent.
 *
 * The window is fixed, not sliding: the first request of a window sets the
 * expiry and every later one inherits it, so a caller who spends their
 * allowance waits out the remainder rather than being throttled forever by
 * their own retries. Good enough to bound abuse, and it cannot lock out a
 * legitimate caller indefinitely.
 */
export async function claim(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);

  /*
   * Reopen the window if its time has passed. Mongo's TTL sweeper only runs
   * about once a minute, so an expired row is routinely still sitting there and
   * a spent allowance would otherwise outlive its own window.
   */
  await RateLimit.updateOne(
    { key, expiresAt: { $lte: now } },
    { $set: { count: 0, expiresAt } },
  );

  /*
   * The limit lives in the filter, so the check and the increment are one
   * atomic step - two simultaneous requests cannot both take the last slot.
   *
   * Deliberately NOT an upsert. An upsert here looks tidier but is wrong: when
   * the row exists and the allowance is spent the filter matches nothing, so
   * Mongo tries to INSERT, hits the unique index on `key`, and the caller gets
   * a duplicate-key error instead of a clean "over the limit". The two cases
   * are separated by hand below.
   */
  const bumped = await RateLimit.updateOne(
    { key, count: { $lt: limit } },
    { $inc: { count: 1 } },
  );
  if (bumped.matchedCount === 1) return true;

  // Nothing matched, which is either "no window yet" or "allowance spent".
  const existing = await RateLimit.findOne({ key });
  if (existing) return false;

  try {
    await RateLimit.create({ key, count: 1, expiresAt });
    return true;
  } catch {
    // Another request opened the window between the read and the insert. The
    // row now exists, so the ordinary increment settles it.
    const retry = await RateLimit.updateOne(
      { key, count: { $lt: limit } },
      { $inc: { count: 1 } },
    );
    return retry.matchedCount === 1;
  }
}

/** `claim`, but throws the 429 for you. */
export async function enforce(
  key: string,
  limit: number,
  windowMs: number,
  message: string,
): Promise<void> {
  if (!(await claim(key, limit, windowMs))) {
    throw new ApiError(429, message);
  }
}

/**
 * Best-effort client address.
 *
 * Behind a proxy the socket address is the proxy's, so the forwarded headers
 * are the only signal available - and they are caller-controlled, which is why
 * this is one of two keys on the registration route rather than the only one.
 * A caller who forges the header still runs into the per-email limit.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",");
    if (first?.trim()) return first.trim();
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
