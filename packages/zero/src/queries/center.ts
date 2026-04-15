import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

function withRelated(q: typeof zql.center) {
  return q
    .related("coordinators", (c) => c.related("user"))
    .related("students", (s) =>
      s.related("center").related("classEvents", (ce) => ce.related("event"))
    );
}

/**
 * Scoped center query for non-manage users.
 * Shows centers where user's team(s) run class events,
 * OR where user is a coordinator.
 */
function scopedCenters(userId: string | undefined) {
  return withRelated(zql.center)
    .where(({ or, exists }) =>
      or(
        // Center has a class event from a team the user belongs to
        exists("events", (e) =>
          e
            .where("type", "class")
            .whereExists("team", (t) =>
              t.whereExists("members", (m) => m.where("userId", userId))
            )
        ),
        // User is a coordinator at this center
        exists("coordinators", (c) => c.where("userId", userId))
      )
    )
    .orderBy("name", "asc");
}

export const centerQueries = {
  all: defineQuery(({ ctx }) =>
    can(ctx, "centers.manage")
      ? withRelated(zql.center).orderBy("name", "asc")
      : scopedCenters(ctx?.userId)
  ),

  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    can(ctx, "centers.manage")
      ? withRelated(zql.center).where("id", id).one()
      : withRelated(zql.center)
          .where("id", id)
          .where(({ or, exists }) =>
            or(
              exists("events", (e) =>
                e
                  .where("type", "class")
                  .whereExists("team", (t) =>
                    t.whereExists("members", (m) =>
                      m.where("userId", ctx?.userId)
                    )
                  )
              ),
              exists("coordinators", (c) => c.where("userId", ctx?.userId))
            )
          )
          .one()
  ),
};
