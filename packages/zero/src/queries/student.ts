import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

function withRelated(q: typeof zql.student) {
  return q
    .related("center")
    .related("classEvents", (ce) => ce.related("event"));
}

export const studentQueries = {
  all: defineQuery(({ ctx }) =>
    ctx != null && can(ctx, "students.manage")
      ? withRelated(zql.student).orderBy("name", "asc")
      : withRelated(zql.student).orderBy("name", "asc")
  ),

  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id } }) =>
    withRelated(zql.student).where("id", id).one()
  ),

  byCenter: defineQuery(
    z.object({ centerId: z.string() }),
    ({ args: { centerId } }) =>
      withRelated(zql.student)
        .where("centerId", centerId)
        .orderBy("name", "asc")
  ),
};
