import { Schema, model, models, type Model, type Types } from "mongoose";

/**
 * A counter with an expiry, for throttling callers who have no account yet.
 *
 * The throttles already in `tokens.ts` - `claimCodeRequest`, `hasRecentToken` -
 * all key on a `User._id`, which works because every one of them guards an
 * action taken against an existing account. Registration is the first route
 * that has to be bounded *before* an account exists, so the key has to be
 * something the caller supplies: an IP address, or the email being claimed.
 *
 * Deliberately a collection rather than an in-process map. The app runs behind
 * a custom `server.ts` and may be more than one process; a map would give each
 * of them its own allowance, which is not a limit.
 */
export interface IRateLimit {
  _id: Types.ObjectId;
  /** Namespaced, e.g. `parent-register:ip:203.0.113.4`. */
  key: string;
  count: number;
  /** When the window closes. Mongo removes the row itself at this time. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

/*
 * Mongo sweeps expired windows itself, so this collection stays small without
 * a cron. The sweeper is lazy - about once a minute - which is why `claim()`
 * compares `expiresAt` rather than trusting a row's absence to mean "expired".
 */
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit =
  (models.RateLimit as Model<IRateLimit>) ??
  model<IRateLimit>("RateLimit", RateLimitSchema);
