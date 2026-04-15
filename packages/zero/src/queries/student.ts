import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

function withRelated(q: typeof zql.student) {
  return q
    .related("center")
    .related("classEvents", (ce) => ce.related("event"));
}

/**
 * Scoped student query for non-manage users.
 * Shows students at centers where user's team(s) run class events,
 * OR at centers where user is a coordinator.
 */
function scopedStudents(userId: string | undefined) {
  return withRelated(zql.student)
    .where(({ or, exists }) =>
      or(
        // Student's center has a class event from a team the user belongs to
        exists("center", (c) =>
          c.whereExists("events", (e) =>
            e
              .where("type", "class")
              .whereExists("team", (t) =>
                t.whereExists("members", (m) => m.where("userId", userId))
              )
          )
        ),
        // Student's center has user as coordinator
        exists("center", (c) =>
          c.whereExists("coordinators", (co) => co.where("userId", userId))
        )
      )
    )
    .orderBy("name", "asc");
}

export const studentQueries = {
  all: defineQuery(({ ctx }) =>
    can(ctx, "students.manage")
      ? withRelated(zql.student).orderBy("name", "asc")
      : scopedStudents(ctx?.userId)
  ),

  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    can(ctx, "students.manage")
      ? withRelated(zql.student).where("id", id).one()
      : withRelated(zql.student)
          .where("id", id)
          .where(({ or, exists }) =>
            or(
              exists("center", (c) =>
                c.whereExists("events", (e) =>
                  e
                    .where("type", "class")
                    .whereExists("team", (t) =>
                      t.whereExists("members", (m) =>
                        m.where("userId", ctx?.userId)
                      )
                    )
                )
              ),
              exists("center", (c) =>
                c.whereExists("coordinators", (co) =>
                  co.where("userId", ctx?.userId)
                )
              )
            )
          )
          .one()
  ),

  byCenter: defineQuery(
    z.object({ centerId: z.string() }),
    ({ args: { centerId } }) =>
      withRelated(zql.student)
        .where("centerId", centerId)
        .orderBy("name", "asc")
  ),
};
