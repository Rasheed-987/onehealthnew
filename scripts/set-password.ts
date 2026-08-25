/**
 * Sets a known password on an existing account, for local testing.
 *
 *   npm run set:password -- teacher@example.com Passw0rd!
 *
 * Staff accounts are created with a random password nobody is told and a
 * status of INVITED, then activated by an emailed link. That is correct for
 * the real school and useless against a local Postman collection - there is no
 * SMTP server on a laptop, so a teacher login cannot be obtained at all.
 *
 * This is the escape hatch: it also flips the account to ACTIVE and clears
 * `mustChangePassword`, so the resulting session behaves like a settled user
 * rather than one the dashboard would bounce to /change-password.
 *
 * Development only. The guard is on NODE_ENV rather than on the host in
 * MONGODB_URI: the development database here is a hosted Atlas cluster, so a
 * "must be localhost" check would reject every legitimate run and teach you to
 * pass the override every time - which is the same as having no guard.
 */

import mongoose from "mongoose";

import { connectDB } from "../src/lib/db";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/password";
import { User } from "../src/models";
import { USER_STATUS } from "../src/models/enums";

function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NODE_ENV is production. This script sets a known password on any\n" +
        "account by email - never run it against the live school.",
    );
  }
}

async function main(): Promise<void> {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    throw new Error(
      "Usage: npm run set:password -- <email> <password>",
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  assertNotProduction();
  await connectDB();

  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) throw new Error(`No account with the email ${email}.`);

  user.password = await hashPassword(password);
  user.status = USER_STATUS.ACTIVE;
  user.mustChangePassword = false;
  await user.save();

  console.log(`Set password for ${user.email} (${user.role}).`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
