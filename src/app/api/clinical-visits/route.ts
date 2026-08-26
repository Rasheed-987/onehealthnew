import type { NextRequest } from "next/server";

import { handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  CreateVisitSchema,
  hydrateClinicalVisitRows,
  summariseVisits,
  visitRangeFilter,
} from "@/lib/clinicalVisits";
import { findStudentToRecord } from "@/lib/progressScope";
import {
  narrowToClassroom,
  narrowToStudent,
  resolveRecordScope,
} from "@/lib/recordScope";
import { ClinicalVisit } from "@/models";
import { VISIT_OUTCOME, type VisitOutcome } from "@/models/enums";

/**
 * Clinical visits: reading the log, and adding to it.
 *
 * Neither handler branches on role. `resolveRecordScope` turns the session into
 * a filter once - the whole school for a super admin, the caller's rooms for a
 * teacher, the caller's children for a guardian - and everything below ANDs
 * that in. See lib/recordScope.ts.
 */

/** A term of visits for one room is well under this. */
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("health:list");
    const scope = await resolveRecordScope(session);
    const params = request.nextUrl.searchParams;

    // Start from the caller's scope, then narrow by whatever they asked for.
    // `narrowTo*` re-checks the id against the scope, so a guardian passing
    // another family's student id gets a 404, not that child's health record.
    let filter: Record<string, unknown> = { ...scope.filter };

    const classroom = params.get("classroom");
    if (classroom) filter = narrowToClassroom(scope, classroom);

    const student = params.get("student");
    if (student) filter = { ...filter, ...narrowToStudent(scope, student) };

    const outcome = params.get("outcome");
    if (outcome && outcome in VISIT_OUTCOME) {
      filter.outcome = outcome as VisitOutcome;
    }

    const visitedAt = visitRangeFilter(
      params.get("from") ?? undefined,
      params.get("to") ?? undefined,
    );
    if (visitedAt) filter.visitedAt = visitedAt;

    // Clamped at both ends: a negative limit is a special, cursor-closing
    // value in MongoDB rather than the no-op the caller meant.
    const limit = Math.min(
      Math.max(Number(params.get("limit")) || 100, 1),
      MAX_LIMIT,
    );

    const visits = await ClinicalVisit.find(filter)
      .sort({ visitedAt: -1 })
      .limit(limit);

    const rows = await hydrateClinicalVisitRows(visits);

    return ok({
      scope: {
        role: session.role,
        // Lets the client decide whether to render a classroom picker at all.
        classroomIds: scope.classroomIds,
      },
      visits: rows,
      summary: summariseVisits(rows),
    });
  });
}

/**
 * A plain create, not the upsert the daily sheet uses.
 *
 * There is no natural key to address a visit by - a child can be seen twice in
 * a morning - so a second POST is a second visit, deliberately. Correcting one
 * is PATCH on `[id]`.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("health:write");
    const input = await parseBody(request, CreateVisitSchema);

    // Stricter than reading, and the classroom is derived from the child's
    // active enrolment rather than trusted from the body - see progressScope.
    const { student, classroom } = await findStudentToRecord(
      session,
      input.student,
      "record a clinical visit for",
    );

    const visit = await ClinicalVisit.create({
      student: student._id,
      classroom: classroom._id,
      // Absent means the nurse is writing this up as it happens.
      visitedAt: input.visitedAt ? new Date(input.visitedAt) : new Date(),
      fluSymptoms: input.fluSymptoms,
      fluSymptomsOther: input.fluSymptomsOther,
      otherSymptoms: input.otherSymptoms,
      additionalSymptoms: input.additionalSymptoms,
      additionalSymptomsOther: input.additionalSymptomsOther,
      nursingCare: input.nursingCare,
      careNotes: input.careNotes,
      outcome: input.outcome,
      notes: input.notes,
      recordedBy: session.userId,
    });

    const [row] = await hydrateClinicalVisitRows([visit]);
    return ok({ visit: row }, 201);
  });
}
