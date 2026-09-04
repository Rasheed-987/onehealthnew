import mongoose from "mongoose";
import { z } from "zod";

import { ApiError, handle, ok, parseBody } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { sendActivationCodeEmail } from "@/lib/emails";
import { createParentAccount } from "@/lib/guardians";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { escapeRegex } from "@/lib/teachers";
import { issueOtpToken } from "@/lib/tokens";
import { GuardianLinkRequest, Parent, Student, User } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";
import {
  GUARDIAN_LINK_STATUS,
  USER_ROLE,
  USER_STATUS,
} from "@/models/enums";

/**
 * A guardian signing themselves up from the app, naming their child by the
 * student ID the school gave the family.
 *
 * This is the only route in the app that creates an account without a signed-in
 * caller, and it is worth being explicit about why that is safe. It does NOT
 * link anybody to anybody: it files a request. The link the app is asking for
 * lives on `Student.guardians[]`, and the instant a row lands there the parent
 * can read that child's medical notes, photos and daily sheets - so writing one
 * here would turn a guessed student ID into a data breach. Staff approve the
 * request in the dashboard, and that approval is the only thing that writes.
 *
 * What the account can do before then is nothing: `guardedStudentIds` returns an
 * empty list for a guardian with no links, so every scoped screen is simply
 * empty and the app shows a "waiting for the school" state.
 *
 * The password is validated here but deliberately not stored. The account is
 * created INVITED with the usual placeholder, and the real password is set by
 * `/api/auth/activate` once the 6-digit code proves the mailbox - so an address
 * somebody else typed never ends up holding a working credential.
 */

const RegisterSchema = z
  .object({
    /*
     * One field, because the app's form has one box. Split rather than asked
     * for twice: a family filling this in on a phone should not have to think
     * about which half of their name goes where, and staff see the whole thing
     * on the request either way.
     */
    fullName: z
      .string()
      .trim()
      .min(1, "Enter your full name.")
      .refine(
        (value) => value.split(/\s+/).length >= 2,
        "Enter your first and last name.",
      ),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    studentId: z.string().trim().min(1, "Enter your child's student ID."),
    phone: z.string().trim().optional(),
    password: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      ),
    confirmPassword: z.string().min(1, "Repeat the password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  });

/** First word is the given name, the rest is the family name. */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = fullName.split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

/**
 * Finds the child a typed student ID names.
 *
 * Case-insensitive, because a number read out over the phone and typed back on
 * a phone keyboard will not keep its case, and a family being told "no such
 * student" over that is a support call the school does not need.
 *
 * The uniqueness index is case-SENSITIVE, though, so `ab-1` and `AB-1` can both
 * exist as separate children. Two matches therefore means the question is
 * genuinely ambiguous, and guessing which child was meant is the one mistake
 * this route must never make - so it refuses instead.
 */
async function findStudentByTypedId(typed: string) {
  const pattern = new RegExp(`^${escapeRegex(typed)}$`, "i");
  const matches = await Student.find({ studentId: pattern }).limit(2);
  return matches.length === 1 ? matches[0] : null;
}

/** Same wording whichever way the ID failed, so this is not a probe. */
const NO_STUDENT =
  "We could not find a child with that student ID. Check it with the school.";

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseBody(request, RegisterSchema);
    await connectDB();

    const student = await findStudentByTypedId(input.studentId);
    if (!student) {
      throw new ApiError(400, NO_STUDENT, { studentId: NO_STUDENT });
    }

    const { firstName, lastName } = splitName(input.fullName);
    const existing = await User.findOne({ email: input.email });

    /*
     * The email branches, in the order they actually happen. These mirror the
     * cases `resolveGuardians` already handles for the staff-side sheet, and
     * the INVITED one is the important one: a guardian the admin created, who
     * opened the app and tapped Register instead of "Sign in with code". That
     * is the most likely real caller here, and dead-ending them on "email taken"
     * would strand them outside an account that already exists for them.
     */
    if (existing && existing.role !== USER_ROLE.PARENT) {
      throw new ApiError(
        409,
        "That email address belongs to a member of staff. Sign in instead.",
        { email: "This email address already has a staff account." },
      );
    }

    if (existing?.status === USER_STATUS.SUSPENDED) {
      throw new ApiError(
        409,
        "That account is not available. Please contact the school.",
        { email: "This account is not available." },
      );
    }

    if (existing?.status === USER_STATUS.ACTIVE) {
      /*
       * The sibling case: already set up, and registering again because that is
       * the screen they remember. Not a new account, and not really an error.
       *
       * Deliberately points at the school rather than at an in-app screen. The
       * signed-in route below can file this request, but the app has no screen
       * that calls it yet, and naming a button that does not exist is worse
       * than naming none. Staff adding the guardian to the second child on the
       * enrolment sheet is the path that is certain to work today, and it is a
       * routine job rather than an escalation - so the wording says "the
       * school", not "support".
       */
      throw new ApiError(
        409,
        "You already have an account with this email. Ask the school to add your other child to it -",
        { email: "This email address is already registered." },
      );
    }

    let parentId: string;
    let userId: mongoose.Types.ObjectId;
    let greetingName: string;

    if (existing) {
      /*
       * INVITED guardian the school already created. Reuse their account
       * wholesale - creating a second one would produce the "PARENT user with
       * no Parent profile" state that `parentProfileId` 403s on and
       * `resolveGuardians` refuses to work with.
       */
      const parent = await Parent.findOne({ user: existing._id });
      if (!parent) {
        throw new ApiError(
          409,
          "That account is incomplete. Please contact the school.",
          { email: "This account needs repairing by an administrator." },
        );
      }

      parentId = String(parent._id);
      userId = existing._id;
      greetingName = existing.firstName;

      // The admin may already have linked them while the family was installing
      // the app. Nothing to ask for in that case.
      if (student.guardians.some((g) => String(g.parent) === parentId)) {
        throw new ApiError(
          409,
          "You are already linked to this child. Use \"Sign in with code\" to finish setting up your account.",
          { studentId: "You already have access to this child." },
        );
      }

      /*
       * Checked explicitly rather than left to the partial unique index. The
       * index does stop the duplicate, but E11000 surfaces as "that parent is
       * already taken", which names a field the family never typed.
       */
      const pending = await GuardianLinkRequest.findOne({
        parent: parentId,
        student: student._id,
        status: GUARDIAN_LINK_STATUS.PENDING,
      });
      if (pending) {
        throw new ApiError(
          409,
          "You have already asked for access to this child. The school is reviewing it.",
          { studentId: "This request is already with the school." },
        );
      }

      await GuardianLinkRequest.create({
        parent: parentId,
        student: student._id,
        studentIdTyped: input.studentId,
        status: GUARDIAN_LINK_STATUS.PENDING,
      });
    } else {
      const dbSession = await mongoose.startSession();
      let created: { parentId: string; userId: mongoose.Types.ObjectId };
      try {
        created = await dbSession.withTransaction(async () => {
          const account = await createParentAccount(
            { email: input.email, firstName, lastName, phone: input.phone },
            // Nobody at the school created this one; the family did.
            null,
            dbSession,
          );

          await GuardianLinkRequest.create(
            [
              {
                parent: account.parentId,
                student: student._id,
                studentIdTyped: input.studentId,
                status: GUARDIAN_LINK_STATUS.PENDING,
              },
            ],
            { session: dbSession },
          );

          return { parentId: account.parentId, userId: account.userId };
        });
      } finally {
        await dbSession.endSession();
      }

      parentId = created.parentId;
      userId = created.userId;
      greetingName = firstName;
    }

    /*
     * The code goes out after everything is committed, for the reason the invite
     * fan-out on the students route sits outside its transaction too: an email
     * cannot be rolled back, and a guardian must never hold a code for an
     * account a later failure undid.
     *
     * A delivery failure is reported, not thrown. The account and the request
     * are real by this point, and turning a dead mail server into a 500 would
     * tell the family their sign-up failed when it did not - they can ask for
     * another code from the app's existing "Sign in with code" button, which
     * issues exactly this kind of token for an INVITED guardian.
     */
    let codeSent = true;
    try {
      const { otp } = await issueOtpToken(userId, TOKEN_TYPE.ACTIVATION);
      await sendActivationCodeEmail({
        to: input.email,
        firstName: greetingName,
        otp,
      });
    } catch (error) {
      console.error("Activation code email failed:", error);
      codeSent = false;
    }

    /*
     * No session. They have chosen a password but not yet proved the mailbox,
     * and `activate` is what does both - so the app's next screen is the code,
     * not the dashboard.
     */
    return ok(
      {
        needsActivation: true,
        email: input.email,
        codeSent,
        message: codeSent
          ? "Check your email for a 6-digit code to finish setting up your account."
          : "Your account was created, but the code could not be sent. Use \"Sign in with code\" to request another.",
      },
      201,
    );
  });
}
