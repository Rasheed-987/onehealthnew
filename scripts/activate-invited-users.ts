/**
 * One-off migration for accounts created before the invitation flow was
 * dropped.
 *
 * Those accounts were written with `status: INVITED`, which the login route
 * refuses, and there was never an email to activate them with - so they are
 * unusable. This flips them to ACTIVE and marks the password as one the owner
 * did not choose, which is what the current code would have written.
 *
 *   npm run migrate:activate
 *
 * The password itself is NOT touched: nobody knows what it is any more, so the
 * administrator should follow up with "Reset password" on the teachers screen
 * to issue one they can actually hand over.
 */

import mongoose from "mongoose";

import { connectDB } from "../src/lib/db";
import { User } from "../src/models";
import { USER_STATUS } from "../src/models/enums";

async function main(): Promise<void> {
  await connectDB();

  const stranded = await User.find({ status: USER_STATUS.INVITED });
  if (stranded.length === 0) {
    console.log("No INVITED accounts. Nothing to do.");
    return;
  }

  console.log(`Found ${stranded.length} account(s) stuck in INVITED:`);
  for (const user of stranded) {
    console.log(`  ${user.email} (${user.role})`);
  }

  const result = await User.updateMany(
    { status: USER_STATUS.INVITED },
    {
      $set: {
        status: USER_STATUS.ACTIVE,
        // Their password was set by an admin at creation, so it still has to
        // be replaced by its owner on first sign-in.
        mustChangePassword: true,
      },
    },
  );

  console.log(`\nActivated ${result.modifiedCount} account(s).`);
  console.log(
    "Their existing passwords are unknown - use Reset password on the\n" +
      "teachers screen to issue one you can pass on.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
