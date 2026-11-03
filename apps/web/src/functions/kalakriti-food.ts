import { db } from "@pi-dash/db";
import {
  kalakritiAttendee,
  kalakritiOperation,
} from "@pi-dash/db/schema/kalakriti";
import { kalakritiFoodServerQueries } from "@pi-dash/zero/queries";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import z from "zod";

import { buildSessionContext } from "@/lib/api-auth";
import { HttpError } from "@/lib/http-error";
import { canViewKalakritiFoodAttendees } from "@/lib/kalakriti-food-policy";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { zeroDb } from "@/lib/server/zero-db";
import { authMiddleware } from "@/middleware/auth";

export const getKalakritiFoodAttendees = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ year: z.number().int().min(2000).max(2200) }))
  .handler(async ({ context, data }) => {
    if (!context.session) throw new HttpError(401, "Unauthorized");
    const access = await resolveKalakritiEditionAccess({
      role: context.session.user.role ?? "unoriented_volunteer",
      userId: context.session.user.id,
      year: data.year,
    });
    if (!canViewKalakritiFoodAttendees(access) || !access) return [];
    const editionId = access.edition.id;
    // Explicit station projection: never serialize attendee contacts or ledger metadata.
    const attendees = await db
      .select({
        id: kalakritiAttendee.id,
        name: kalakritiAttendee.name,
        humanId: kalakritiAttendee.humanId,
        kind: kalakritiAttendee.kind,
        archivedAt: kalakritiAttendee.archivedAt,
      })
      .from(kalakritiAttendee)
      .where(eq(kalakritiAttendee.editionId, editionId));
    const operations = await db
      .select({
        id: kalakritiOperation.id,
        attendeeId: kalakritiOperation.attendeeId,
        type: kalakritiOperation.type,
        supersededByOperationId: kalakritiOperation.supersededByOperationId,
      })
      .from(kalakritiOperation)
      .where(
        and(
          eq(kalakritiOperation.editionId, editionId),
          isNotNull(kalakritiOperation.attendeeId),
          inArray(kalakritiOperation.type, [
            "attendee_check_in",
            "breakfast",
            "lunch",
          ])
        )
      );
    const byAttendee = new Map<string, typeof operations>();
    for (const operation of operations) {
      if (!operation.attendeeId) continue;
      const list = byAttendee.get(operation.attendeeId) ?? [];
      list.push(operation);
      byAttendee.set(operation.attendeeId, list);
    }
    return attendees.flatMap((attendee) => {
      const marks = byAttendee.get(attendee.id) ?? [];
      if (
        attendee.archivedAt !== null &&
        !marks.some(
          (mark) =>
            (mark.type === "breakfast" || mark.type === "lunch") &&
            mark.supersededByOperationId === null
        )
      )
        return [];
      return [
        {
          id: attendee.id,
          name: attendee.name,
          humanId: attendee.humanId,
          kind: attendee.kind,
          state:
            attendee.archivedAt === null
              ? ("active" as const)
              : ("archived" as const),
          centers: [],
          operations: marks.map(({ id, type, supersededByOperationId }) => ({
            id,
            type,
            supersededByOperationId,
          })),
        },
      ];
    });
  });

export const getKalakritiFoodMemberships = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ editionId: z.string() }))
  .handler(async ({ context, data }) => {
    if (!context.session) throw new HttpError(401, "Unauthorized");
    // The same scoped query Zero used to sync, run here so the client never
    // receives whole membership rows.
    const memberships = await zeroDb.run(
      kalakritiFoodServerQueries.memberships({
        args: { editionId: data.editionId },
        ctx: await buildSessionContext(context.session),
      })
    );
    // Explicit station projection: never serialize membership contact snapshots.
    return memberships.map((membership) => ({
      id: membership.id,
      name: membership.snapshotName,
      humanId: membership.humanId,
      kind: membership.kind,
      state: membership.state ?? undefined,
      centers: [
        ...membership.assignments,
        ...membership.guardianCenters,
      ].flatMap((link) =>
        link.center ? [{ id: link.center.id, name: link.center.name }] : []
      ),
      operations: membership.operations.map(
        ({ id, type, supersededByOperationId }) => ({
          id,
          type,
          supersededByOperationId,
        })
      ),
    }));
  });
