import { randomBytes } from "node:crypto";
import mongoose from "mongoose";

import { ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import type { GuardianInput } from "@/lib/students";
import { isObjectId } from "@/lib/teachers";
import { Parent, User } from "@/models";
import {
  USER_ROLE,
  USER_STATUS,
  type GuardianRelationship,
} from "@/models/enums";

/**
 * Turning the enrolment sheet's guardian rows into real accounts and links.
 *
 * Server-only, and deliberately not in `parents.ts`: that module is the shapes
 * the routes and the browser screens share, and a client component importing a
 * file that pulls in Mongoose is the exact hazard `enums.ts` is kept clean of.
 * Only `import type` reaches the client today, but this keeps that true by
 * construction rather than by luck.
 */

/** A guardian account this request brought into existence, for the invite fan-out. */
export interface CreatedGuardianAccount {
  userId: mongoose.Types.ObjectId;
  parentId: string;
  email: string;
  firstName: string;
}

export interface ResolvedGuardians {
  /** Ready to assign to `Student.guardians`. */
  links: { parent: string; relationship: GuardianRelationship }[];
  /** Empty unless the sheet named someone new. Invite these AFTER the commit. */
  created: CreatedGuardianAccount[];
}

export interface NewParentInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  occupation?: string;
  address?: string;
  emergencyPhone?: string;
}

/**
 * Creates the `User` + `Parent` pair that every guardian account is.
 *
 * Always called inside a transaction: a failure on the second write would
 * otherwise leave a User with role PARENT and no profile - invisible to the
 * parents screen and unreachable by any repair path, and `parentProfileId`
 * would 403 them out of their own app.
 *
 * The password is a placeholder the guardian never learns and cannot use. The
 * account stays INVITED until they redeem the emailed link and choose their own.
 * That holds for a guardian who registers themselves in the app too: they type a
 * password on the form, but it is not stored until they have proved the mailbox
 * with a code, so the placeholder is what sits here in the meantime.
 *
 * `createdBy` is null for exactly that case - nobody at the school created the
 * account, the family did.
 */
export async function createParentAccount(
  input: NewParentInput,
  createdBy: string | null,
  dbSession: mongoose.ClientSession,
): Promise<CreatedGuardianAccount> {
  const [user] = await User.create(
    [
      {
        email: input.email,
        password: await hashPassword(randomBytes(12).toString("base64url")),
        role: USER_ROLE.PARENT,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        status: USER_STATUS.INVITED,
        createdBy,
      },
    ],
    { session: dbSession },
  );

  const [parent] = await Parent.create(
    [
      {
        user: user._id,
        occupation: input.occupation,
        address: input.address,
        emergencyPhone: input.emergencyPhone,
        createdBy,
      },
    ],
    { session: dbSession },
  );

  return {
    userId: user._id,
    parentId: String(parent._id),
    email: user.email,
    firstName: user.firstName,
  };
}

/**
 * Resolves every row on the sheet to a `Parent` id, creating the accounts that
 * do not exist yet.
 *
 * An email that already belongs to a guardian is REUSED rather than rejected.
 * That is the sibling case: someone types a parent's address by hand instead of
 * searching for them, and the friendly answer is to link the child to the
 * account that is already there, not to refuse the enrolment over it.
 *
 * An email belonging to a member of staff is refused, because merging those two
 * identities would give one login two roles and the session carries only one.
 */
export async function resolveGuardians(
  guardians: GuardianInput[],
  createdBy: string,
  dbSession: mongoose.ClientSession,
): Promise<ResolvedGuardians> {
  const links: ResolvedGuardians["links"] = [];
  const created: CreatedGuardianAccount[] = [];

  for (const guardian of guardians) {
    if (guardian.kind === "existing") {
      if (!isObjectId(guardian.parent)) {
        throw new ApiError(400, "That is not a valid guardian id.", {
          guardians: "One of the guardians could not be found.",
        });
      }
      const parent = await Parent.findById(guardian.parent).session(dbSession);
      if (!parent) {
        throw new ApiError(404, "Guardian not found.", {
          guardians: "One of the guardians could not be found.",
        });
      }
      links.push({
        parent: String(parent._id),
        relationship: guardian.relationship,
      });
      continue;
    }

    const existing = await User.findOne({ email: guardian.email }).session(
      dbSession,
    );

    if (existing && existing.role !== USER_ROLE.PARENT) {
      throw new ApiError(
        409,
        `${guardian.email} already belongs to a member of staff.`,
        { guardians: "That email is already used by a staff account." },
      );
    }

    if (existing) {
      const parent = await Parent.findOne({ user: existing._id }).session(
        dbSession,
      );
      if (!parent) {
        /*
         * A PARENT user with no profile predates the transaction above and
         * cannot be repaired from here - creating a second profile would break
         * the `user` unique index on Parent.
         */
        throw new ApiError(
          409,
          `${guardian.email} has an account that is not set up as a guardian. Ask an administrator to repair it.`,
          { guardians: "That guardian's account is incomplete." },
        );
      }
      links.push({
        parent: String(parent._id),
        relationship: guardian.relationship,
      });
      continue;
    }

    const account = await createParentAccount(
      {
        email: guardian.email,
        firstName: guardian.firstName,
        lastName: guardian.lastName,
        phone: guardian.phone,
      },
      createdBy,
      dbSession,
    );
    created.push(account);
    links.push({
      parent: account.parentId,
      relationship: guardian.relationship,
    });
  }

  /*
   * Two rows can name the same person by two different routes - one picked from
   * the search, one typed by email - and the schema-level check cannot see
   * that, because it compares an id against an email. Caught here, where both
   * have become ids, and before the model's own duplicate check produces a
   * message about a field the sheet does not have.
   */
  const ids = links.map((l) => l.parent);
  if (new Set(ids).size !== ids.length) {
    throw new ApiError(400, "The same guardian is listed twice.", {
      guardians: "The same guardian is listed twice.",
    });
  }

  return { links, created };
}
