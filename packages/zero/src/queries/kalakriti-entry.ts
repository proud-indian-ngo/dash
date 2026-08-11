import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

const centerInput = z.object({
  centerId: z.string(),
  editionId: z.string(),
});
const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

export const kalakritiEntryQueries = {
  availableDivisionsByCenter: defineQuery(centerInput, ({ args, ctx }) => {
    let query = zql.kalakritiCompetitionDivision
      .where("editionId", args.editionId)
      .whereExists("competition", (competition) =>
        competition
          .where("cancelledAt", "IS", null)
          .where("retiredAt", "IS", null)
          .whereExists("category", (category) =>
            category.where("retiredAt", "IS", null)
          )
      )
      .whereExists("sessions", (session) =>
        session
          .where("cancelledAt", "IS", null)
          .whereExists("venue", (venue) => venue.where("retiredAt", "IS", null))
      )
      .related("ageCategory")
      .related("competition", (competition) => competition.related("category"))
      .related("entries")
      .related("sessions", (session) => session.related("venue"));
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("createdAt", "asc");
    }
    if (!(ctx && can(ctx, "kalakriti.view"))) {
      return query.where("id", NO_ACCESS_ID);
    }
    query = query.whereExists("edition", (edition) =>
      edition.where(({ or, exists }) =>
        or(
          exists("memberships", (membership) =>
            membership
              .where("userId", ctx.userId)
              .where("state", "active")
              .whereExists("assignments", (assignment) =>
                assignment.where("responsibility", "edition_admin")
              )
          ),
          exists("centers", (center) =>
            center
              .where("id", args.centerId)
              .whereExists("guardianCenters", (guardianCenter) =>
                guardianCenter.whereExists("membership", (membership) =>
                  membership
                    .where("userId", ctx.userId)
                    .where("state", "active")
                )
              )
          ),
          exists("centers", (center) =>
            center
              .where("id", args.centerId)
              .whereExists("assignments", (assignment) =>
                assignment
                  .where("responsibility", "liaison")
                  .whereExists("membership", (membership) =>
                    membership
                      .where("userId", ctx.userId)
                      .where("state", "active")
                  )
              )
          )
        )
      )
    );
    return query.orderBy("createdAt", "asc");
  }),

  visibleByCenter: defineQuery(centerInput, ({ args, ctx }) => {
    const query = zql.kalakritiCompetitionEntry
      .where("editionId", args.editionId)
      .where("centerId", args.centerId)
      .related("members", (member) =>
        member.related("student", (student) => student.related("ageCategory"))
      )
      .related("division", (division) =>
        division
          .related("ageCategory")
          .related("competition", (competition) =>
            competition.related("category")
          )
          .related("sessions", (session) => session.related("venue"))
      );
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("createdAt", "desc");
    }
    if (!(ctx && can(ctx, "kalakriti.view"))) {
      return query.where("id", NO_ACCESS_ID);
    }
    return query
      .where(({ or, exists }) =>
        or(
          exists("edition", (edition) =>
            edition.whereExists("memberships", (membership) =>
              membership
                .where("userId", ctx.userId)
                .where("state", "active")
                .whereExists("assignments", (assignment) =>
                  assignment.where("responsibility", "edition_admin")
                )
            )
          ),
          exists("center", (center) =>
            center.whereExists("guardianCenters", (guardianCenter) =>
              guardianCenter.whereExists("membership", (membership) =>
                membership.where("userId", ctx.userId).where("state", "active")
              )
            )
          ),
          exists("center", (center) =>
            center.whereExists("assignments", (assignment) =>
              assignment
                .where("responsibility", "liaison")
                .whereExists("membership", (membership) =>
                  membership
                    .where("userId", ctx.userId)
                    .where("state", "active")
                )
            )
          )
        )
      )
      .orderBy("createdAt", "desc");
  }),
};
