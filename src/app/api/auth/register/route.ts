import { z } from "zod";

import { handle, ok, parseBody, requirePermission } from "@/lib/api";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { User } from "@/models";
import { USER_ROLE, USER_STATUS } from "@/models/enums";
import type { Permission } from "@/lib/permissions";

/**
 * Creates an account.
 *
 * This is deliberately NOT open registration. `permissions.ts` gives
 * `teacher:create` / `parent:create` to the super admin alone, and the school
 * decides who gets a login - a stranger must not be able to POST themselves
 * into a nursery's system. The caller therefore has to be signed in and hold
 * the right permission for the role they are creating.
 *
 * SUPER_ADMIN is not creatable here at all: there is exactly one, it is
 * planted by `npm run seed:admin`, and `User`'s `one_super_admin` index refuses
 * a second regardless of what this route does.
 */

const REGISTERABLE_ROLES = [
  USER_ROLE.TEACHER,
  USER_ROLE.PARENT,
  USER_ROLE.STUDENT,
] as const;

/** Which permission a caller needs in order to create each role. */
const PERMISSION_FOR_ROLE: Record<
  (typeof REGISTERABLE_ROLES)[number],
  Permission
> = {
  [USER_ROLE.TEACHER]: "teacher:create",
  [USER_ROLE.PARENT]: "parent:create",
  [USER_ROLE.STUDENT]: "student:create",
};

const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    ),
  role: z.enum(REGISTERABLE_ROLES, {
    message: "Choose a role: TEACHER, PARENT or STUDENT.",
  }),
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  phone: z.string().trim().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    // Parsed before the permission check so the caller is told which role they
    // were refused for, rather than being bounced on a role we never read.
    const body = await parseBody(request, RegisterSchema);
    const session = await requirePermission(PERMISSION_FOR_ROLE[body.role]);

    const user = await User.create({
      email: body.email,
      password: await hashPassword(body.password),
      role: body.role,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      // Created by an admin, who hands the password over directly - there is
      // no invitation email, so the account is usable immediately.
      status: USER_STATUS.ACTIVE,
      // The owner did not choose this password, so they must replace it.
      mustChangePassword: true,
      createdBy: session.userId,
    });

    return ok(
      {
        user: {
          id: String(user._id),
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
        },
      },
      201,
    );
  });
}
