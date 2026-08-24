import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { ZodError, type ZodType } from "zod";

import { connectDB } from "@/lib/db";
import { getSession, type SessionPayload } from "@/lib/session";
import { can, type Permission } from "@/lib/permissions";

/**
 * The small amount of plumbing every route handler repeats: one response
 * shape, one way to read a JSON body, one way to demand a signed-in user.
 */

/** Every error response is `{ error, details? }`, so the client parses one shape. */
export function fail(
  status: number,
  error: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    details === undefined ? { error } : { error, details },
    { status },
  );
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Thrown by the `require*` helpers and caught by `handle`, so a handler can
 * read like a straight line instead of threading early returns.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Wraps a handler so nothing escapes as an unhandled rejection: Zod issues
 * become 400s, ApiErrors carry their own status, and anything else is logged
 * server-side and answered with a bare 500 - an internal message (a Mongo
 * error, a stack) must never reach the client.
 */
export async function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.status, error.message, error.details);
    }
    if (error instanceof ZodError) {
      return fail(400, "Invalid request.", flattenZodError(error));
    }
    if (error instanceof mongoose.Error.ValidationError) {
      return fail(400, "Invalid request.", flattenMongooseError(error));
    }
    // A unique-index collision is the caller sending a value someone already
    // has - a 409 naming the field, not a 500.
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000
    ) {
      return duplicateKeyResponse(error);
    }
    console.error("Unhandled error in route handler:", error);
    return fail(500, "Something went wrong. Please try again.");
  }
}

/** `{ email: "Enter a valid email address." }` - the shape the forms render. */
export function flattenZodError(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

function flattenMongooseError(
  error: mongoose.Error.ValidationError,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [path, issue] of Object.entries(error.errors)) {
    fields[path] = issue.message;
  }
  return fields;
}

/**
 * Turns E11000 into a message about the field that collided. `one_super_admin`
 * is keyed on `role` but does not mean "this role is taken" - it means the
 * single-super-admin rule fired - so it is worded separately.
 */
function duplicateKeyResponse(
  error: mongoose.mongo.MongoServerError,
): NextResponse {
  const field = Object.keys(error.keyPattern ?? {})[0];
  if (field === "role") {
    return fail(409, "A super admin already exists.");
  }
  const label = field ?? "value";
  return fail(409, `That ${label} is already taken.`, {
    [label]: `This ${label} is already registered.`,
  });
}

/** Parses and validates a JSON body, rejecting a malformed one as a 400. */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

/** 401 unless a valid session cookie is present. Also opens the DB connection. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "You must be signed in.");
  await connectDB();
  return session;
}

/**
 * Role-level gate. This is the coarse check only - a handler touching a
 * specific record still has to run the row-level check from `permissions.ts`
 * (`isGuardianOf`, `teachesClassroom`) once it has the record in hand.
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionPayload> {
  const session = await requireSession();
  if (!can(session.role, permission)) {
    throw new ApiError(403, "You do not have permission to do that.");
  }
  return session;
}
