import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

function withRelated(q: typeof zql.teamEvent) {
  return q
    .related("members", (m) => m.related("user"))
    .related("whatsappGroup")
    .related("interests", (i) => i.related("user"));
}

export const teamEventQueries = {
  byTeam: defineQuery(
    z.object({ teamId: z.string() }),
    ({ args: { teamId }, ctx }) =>
      ctx?.role === "admin"
        ? withRelated(zql.teamEvent)
            .where("teamId", teamId)
            .where("cancelledAt", "IS", null)
            .orderBy("startTime", "desc")
        : withRelated(zql.teamEvent)
            .where("teamId", teamId)
            .where("cancelledAt", "IS", null)
            .where(({ or, cmp, exists }) =>
              or(
                cmp("isPublic", true),
                exists("members", (m) => m.where("userId", ctx?.userId ?? ""))
              )
            )
            .orderBy("startTime", "desc")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    ctx?.role === "admin"
      ? withRelated(zql.teamEvent).where("id", id).one()
      : withRelated(zql.teamEvent)
          .where("id", id)
          .where(({ or, cmp, exists }) =>
            or(
              cmp("isPublic", true),
              exists("members", (m) => m.where("userId", ctx?.userId ?? ""))
            )
          )
          .one()
  ),
  public: defineQuery(() =>
    zql.teamEvent
      .where("isPublic", true)
      .where("cancelledAt", "IS", null)
      .related("members")
      .related("team")
      .orderBy("startTime", "desc")
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    withRelated(zql.teamEvent)
      .related("team")
      .whereExists("members", (m) => m.where("userId", ctx?.userId ?? ""))
      .where("cancelledAt", "IS", null)
      .orderBy("startTime", "desc")
  ),
};
