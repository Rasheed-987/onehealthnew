/**
 * Bootstraps the one super admin account.
 *
 * The super admin is the only user nobody can create through the API - every
 * other account is invited by someone already signed in - so it has to be
 * planted directly in the database. Run once per environment:
 *
 *   npm run seed:admin
 *
 * Credentials come from the environment, never from this file:
 *
 *   SUPER_ADMIN_EMAIL       required
 *   SUPER_ADMIN_PASSWORD    optional - a strong one is generated and printed
 *                           once if omitted
 *   SUPER_ADMIN_FIRST_NAME  optional, defaults to "Super"
 *   SUPER_ADMIN_LAST_NAME   optional, defaults to "Admin"
 *
 * The script is idempotent: if a super admin already exists it reports and
 * exits without touching it. Pass `--reset-password` to set a new password on
 * the existing account instead.
 */

import { randomBytes } from "node:crypto";
import mongoose from "mongoose";

import { connectDB } from "../src/lib/db";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/password";
import { User } from "../src/models";
import { USER_ROLE, USER_STATUS } from "../src/models/enums";

const RESET_PASSWORD = process.argv.includes("--reset-password");

/** URL-safe, ~24 characters, 144 bits of entropy. */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

function requireEmail(): string {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      "SUPER_ADMIN_EMAIL is not set. Add it to .env.local (see .env.example).",
    );
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error(`SUPER_ADMIN_EMAIL is not a valid email: ${email}`);
  }
  return email;
}

/**
 * Returns the password to store and whether it was generated, so the caller
 * knows if it has to be shown to the operator.
 */
function resolvePassword(): { password: string; generated: boolean } {
  const supplied = process.env.SUPER_ADMIN_PASSWORD;
  if (!supplied) return { password: generatePassword(), generated: true };
  if (supplied.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SUPER_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return { password: supplied, generated: false };
}

function announce(password: string, generated: boolean): void {
  if (!generated) return;
  console.log(
    [
      "",
      "  Generated password (shown once - store it now):",
      "",
      `      ${password}`,
      "",
      "  Set SUPER_ADMIN_PASSWORD in .env.local to choose your own instead.",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const email = requireEmail();

  await connectDB();
  // The single-super-admin rule is a unique index, and on a fresh database it
  // does not exist until something builds it. Without this the check below is
  // the only guard, and two concurrent runs both pass it. `createIndexes`
  // rather than `syncIndexes` so nothing already in the collection is dropped.
  await User.createIndexes();

  const existing = await User.findOne({ role: USER_ROLE.SUPER_ADMIN });

  if (existing && !RESET_PASSWORD) {
    console.log(
      `Super admin already exists: ${existing.email} (${existing.status}).`,
    );
    console.log("Nothing to do. Pass --reset-password to set a new password.");
    return;
  }

  const { password, generated } = resolvePassword();
  const hashed = await hashPassword(password);

  if (existing) {
    existing.password = hashed;
    existing.status = USER_STATUS.ACTIVE;
    await existing.save();
    console.log(`Password reset for super admin ${existing.email}.`);
    announce(password, generated);
    return;
  }

  const created = await User.create({
    email,
    password: hashed,
    role: USER_ROLE.SUPER_ADMIN,
    firstName: process.env.SUPER_ADMIN_FIRST_NAME?.trim() || "Super",
    lastName: process.env.SUPER_ADMIN_LAST_NAME?.trim() || "Admin",
    // Seeded directly, so it can sign in immediately - there is no invite
    // email to accept, and nobody exists yet to send one.
    status: USER_STATUS.ACTIVE,
    createdBy: null,
  });

  console.log(`Created super admin ${created.email} (${created._id}).`);
  announce(password, generated);
}

main()
  .catch((error: unknown) => {
    // A duplicate key can come from either unique index on `users`, and the
    // two mean very different things - name the one that actually fired
    // rather than assuming it was the super-admin guard.
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000
    ) {
      const index = String(
        (error as { keyPattern?: unknown }).keyPattern
          ? Object.keys(error.keyPattern as object).join(", ")
          : "unknown",
      );
      if (index === "role") {
        console.error(
          "A super admin already exists - the database refused a second one.",
        );
      } else {
        console.error(
          `A user with this ${index} already exists in the "${mongoose.connection.name}" database.`,
        );
        console.error(
          "Check that MONGODB_URI names the right database and that SUPER_ADMIN_EMAIL is free.",
        );
      }
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
