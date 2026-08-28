import { Schema, model, models, type Model, type Types } from "mongoose";

/**
 * Single-use links sent by email: invitations and password resets.
 *
 * The raw token is never stored. It goes out in the email and only its SHA-256
 * hash is kept here, for the same reason passwords are hashed - a leaked dump
 * of this collection must not let anyone take over accounts. Verification
 * hashes the token from the URL and looks that up.
 */

export const TOKEN_TYPE = {
  /**
   * First-time account setup by emailed link, for staff. The user has no
   * usable password yet.
   */
  INVITE: "INVITE",
  /**
   * First-time account setup by 6-digit code, for guardians.
   *
   * The same job as INVITE and deliberately NOT the same type. Guardians live
   * on the mobile app, where a link that opens a browser is the wrong door, so
   * they get a code they ask for from inside the app instead. Two types rather
   * than one because the lifetimes differ - a link survives a weekend, a code
   * lasts ten minutes - and because `issueOtpToken` clears every prior token of
   * the type it is issuing, so sharing one would let a guardian requesting a
   * code destroy a member of staff's live invitation.
   */
  ACTIVATION: "ACTIVATION",
  /** "Forgot password" for an account that is already active. */
  PASSWORD_RESET: "PASSWORD_RESET",
} as const;
export type TokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

export interface IVerificationToken {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** SHA-256 of the token that was emailed. Never the token itself. */
  tokenHash: string;
  type: TokenType;
  expiresAt: Date;
  /** Set the moment the token is spent, so it cannot be replayed. */
  usedAt?: Date | null;
  attempts?: number;
  createdAt: Date;
  updatedAt: Date;
}

const VerificationTokenSchema = new Schema<IVerificationToken>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    type: {
      type: String,
      enum: Object.values(TOKEN_TYPE),
      required: true,
    },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/*
 * Mongo drops these on its own once they expire, so spent and stale tokens do
 * not accumulate. The sweeper runs about once a minute, which is why every
 * read still checks `expiresAt` rather than trusting the document's absence.
 */
VerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationToken =
  (models.VerificationToken as Model<IVerificationToken>) ??
  model<IVerificationToken>("VerificationToken", VerificationTokenSchema);
