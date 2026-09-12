import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { can } from "../permissions";
import { zql } from "../schema";
import { buildKalakritiLiaisonResponsibilityOr } from "./kalakriti-liaison-scope";

const centerInput = z.object({
  centerId: z.string(),
  editionId: z.string(),
});
const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

function availableDivisions(
  args: { editionId: string; centerId?: string },
  ctx: Context | null
) {
  const limitCenter = (center: typeof zql.kalakritiCenter) =>
    args.centerId === undefined ? center : center.where("id", args.centerId);
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
    .related("sessions", (session) => session.related("venue"));
  if (ctx !== null && can(ctx, "kalakriti.admin")) {
    return query.orderBy("createdAt", "asc");
  }
  if (!(ctx && can(ctx, "kalakriti.view"))) {
    return query.where("id", NO_ACCESS_ID);
  }
  query = query.where(({ or, exists }) =>
    or(
      exists("edition", (edition) =>
        edition.whereExists("memberships", (membership) =>
          membership
            .where("userId", ctx.userId)
            .where("state", "active")
            .whereExists("assignments", (assignment) =>
              assignment.where(({ or: assignmentOr, cmp }) =>
                assignmentOr(
                  cmp("responsibility", "edition_admin"),
                  cmp("responsibility", "liaison_lead"),
                  cmp("responsibility", "overall_events_lead")
                )
              )
            )
        )
      ),
      exists("edition", (edition) =>
        edition.whereExists("centers", (center) =>
          limitCenter(center).whereExists("guardianCenters", (guardianCenter) =>
            guardianCenter
              .where("editionId", args.editionId)
              .whereExists("membership", (membership) =>
                membership
                  .where("editionId", args.editionId)
                  .where("kind", "guardian")
                  .where("userId", ctx.userId)
                  .where("state", "active")
              )
          )
        )
      ),
      exists("edition", (edition) =>
        edition.whereExists("centers", (center) =>
          limitCenter(center).whereExists("assignments", (assignment) =>
            assignment
              .where(({ or: liaisonOr, cmp }) =>
                buildKalakritiLiaisonResponsibilityOr(liaisonOr, cmp)
              )
              .whereExists("membership", (membership) =>
                membership.where("userId", ctx.userId).where("state", "active")
              )
          )
        )
      ),
      exists("competition", (competition) =>
        competition.whereExists("category", (category) =>
          category.whereExists("assignments", (assignment) =>
            assignment
              .where("responsibility", "competition_category_lead")
              .whereExists("membership", (membership) =>
                membership.where("userId", ctx.userId).where("state", "active")
              )
          )
        )
      ),
      exists("competition", (competition) =>
        competition.whereExists("assignments", (assignment) =>
          assignment
            .where("responsibility", "competition_coordinator")
            .whereExists("membership", (membership) =>
              membership.where("userId", ctx.userId).where("state", "active")
            )
        )
      )
    )
  );
  return query.orderBy("createdAt", "asc");
}

function visibleEntries(
  args: { editionId: string; centerId?: string },
  ctx: Context | null,
  attendance?: { divisionId: string; sessionId: string }
) {
  let query = zql.kalakritiCompetitionEntry
    .related("musicFiles")
    .where("editionId", args.editionId)
    .related("center")
    .related("members", (member) =>
      member.where("editionId", args.editionId).related("student", (student) =>
        student
          .related("ageCategory")
          .related("center")
          .related("operations", (operations) => {
            const scoped = operations.where("editionId", args.editionId);
            return attendance
              ? scoped.where(({ or, and, cmp }) =>
                  or(
                    cmp("type", "venue_arrival"),
                    and(
                      cmp("type", "competition_attendance"),
                      cmp("competitionSessionId", attendance.sessionId)
                    )
                  )
                )
              : scoped.where("type", "venue_arrival");
          })
      )
    )
    .related("division", (division) =>
      division
        .related("ageCategory")
        .related("competition", (competition) =>
          competition.related("category")
        )
        .related("sessions", (session) => session.related("venue"))
    );
  if (attendance) {
    query = query
      .where("divisionId", attendance.divisionId)
      .whereExists("division", (division) =>
        division
          .where("editionId", args.editionId)
          .whereExists("sessions", (session) =>
            session
              .where("editionId", args.editionId)
              .where("id", attendance.sessionId)
          )
      );
  }
  if (args.centerId !== undefined)
    query = query.where("centerId", args.centerId);
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
                assignment.where(({ or: assignmentOr, cmp }) =>
                  assignmentOr(
                    cmp("responsibility", "edition_admin"),
                    cmp("responsibility", "liaison_lead"),
                    cmp("responsibility", "overall_events_lead")
                  )
                )
              )
          )
        ),
        exists("center", (center) =>
          center.whereExists("guardianCenters", (guardianCenter) =>
            guardianCenter
              .where("editionId", args.editionId)
              .whereExists("membership", (membership) =>
                membership
                  .where("editionId", args.editionId)
                  .where("kind", "guardian")
                  .where("userId", ctx.userId)
                  .where("state", "active")
              )
          )
        ),
        exists("center", (center) =>
          center.whereExists("assignments", (assignment) =>
            assignment
              .where(({ or: liaisonOr, cmp }) =>
                buildKalakritiLiaisonResponsibilityOr(liaisonOr, cmp)
              )
              .whereExists("membership", (membership) =>
                membership.where("userId", ctx.userId).where("state", "active")
              )
          )
        ),
        exists("division", (division) =>
          division.whereExists("competition", (competition) =>
            competition.whereExists("category", (category) =>
              category.whereExists("assignments", (assignment) =>
                assignment
                  .where("responsibility", "competition_category_lead")
                  .whereExists("membership", (membership) =>
                    membership
                      .where("userId", ctx.userId)
                      .where("state", "active")
                  )
              )
            )
          )
        ),
        exists("division", (division) =>
          division.whereExists("competition", (competition) =>
            competition.whereExists("assignments", (assignment) =>
              assignment
                .where("responsibility", "competition_coordinator")
                .whereExists("membership", (membership) =>
                  membership
                    .where("userId", ctx.userId)
                    .where("state", "active")
                )
            )
          )
        )
      )
    )
    .orderBy("createdAt", "desc");
}

const editionInput = z.object({ editionId: z.string() });
export const kalakritiEntryQueries = {
  availableDivisionsByCenter: defineQuery(centerInput, ({ args, ctx }) =>
    availableDivisions(args, ctx)
  ),
  availableDivisions: defineQuery(editionInput, ({ args, ctx }) =>
    availableDivisions(args, ctx)
  ),
  visibleByCenter: defineQuery(centerInput, ({ args, ctx }) =>
    visibleEntries(args, ctx)
  ),
  visible: defineQuery(editionInput, ({ args, ctx }) =>
    visibleEntries(args, ctx)
  ),
  visibleByDivision: defineQuery(
    editionInput.extend({ divisionId: z.string(), sessionId: z.string() }),
    ({ args, ctx }) => visibleEntries(args, ctx, args)
  ),
  byId: defineQuery(editionInput.extend({ id: z.string() }), ({ args, ctx }) =>
    visibleEntries(args, ctx).where("id", args.id).one()
  ),
};
