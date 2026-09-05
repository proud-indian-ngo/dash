import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

const subjectInput = z.object({
  editionId: z.string(),
  membershipId: z.string().optional(),
  studentId: z.string().optional(),
});

const humanIdInput = z.object({
  editionId: z.string(),
  humanId: z.string().min(1),
});

export const kalakritiOperationQueries = {
  bySubject: defineQuery(subjectInput, ({ args, ctx }) => {
    let query = zql.kalakritiOperation.where("editionId", args.editionId);
    if (args.studentId) {
      query = query.where("studentId", args.studentId);
    } else if (args.membershipId) {
      query = query
        .where("membershipId", args.membershipId)
        .whereExists("membership", (membership) =>
          membership.where("kind", "volunteer").where("state", "active")
        );
    } else {
      return query.where("id", NO_ACCESS_ID).orderBy("createdAt", "desc");
    }

    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("createdAt", "desc");
    }
    if (!ctx?.userId) {
      return query.where("id", NO_ACCESS_ID).orderBy("createdAt", "desc");
    }

    const userId = ctx.userId;
    if (args.studentId) {
      return query
        .where(({ and, cmp, exists, or }) =>
          or(
            exists("edition", (edition) =>
              edition
                .where("id", args.editionId)
                .whereExists("memberships", (membership) =>
                  membership
                    .where("userId", userId)
                    .where("state", "active")
                    .where("kind", "volunteer")
                    .whereExists("assignments", (assignment) =>
                      assignment.where("responsibility", "edition_admin")
                    )
                )
            ),
            and(
              or(
                cmp("type", "pickup"),
                cmp("type", "venue_departure"),
                cmp("type", "drop_off")
              ),
              exists("student", (student) =>
                student.where(({ or: studentOr, exists: studentExists }) =>
                  studentOr(
                    studentExists("edition", (edition) =>
                      edition.whereExists("memberships", (membership) =>
                        membership
                          .where("userId", userId)
                          .where("state", "active")
                          .where("kind", "volunteer")
                          .whereExists("assignments", (assignment) =>
                            assignment.where("responsibility", "transport_lead")
                          )
                      )
                    ),
                    studentExists("center", (center) =>
                      center.whereExists("assignments", (assignment) =>
                        assignment
                          .where("responsibility", "transport_coordinator")
                          .whereExists("membership", (membership) =>
                            membership
                              .where("editionId", args.editionId)
                              .where("userId", userId)
                              .where("state", "active")
                              .where("kind", "volunteer")
                          )
                      )
                    )
                  )
                )
              )
            ),
            and(
              or(cmp("type", "breakfast"), cmp("type", "lunch")),
              exists("edition", (edition) =>
                edition.whereExists("memberships", (membership) =>
                  membership
                    .where("userId", userId)
                    .where("state", "active")
                    .where("kind", "volunteer")
                    .whereExists("assignments", (assignment) =>
                      assignment.where("responsibility", "food_lead")
                    )
                )
              )
            ),
            and(
              cmp("type", "competition_attendance"),
              exists("session", (session) =>
                session.whereExists("division", (division) =>
                  division.whereExists("competition", (competition) =>
                    competition.whereExists("assignments", (assignment) =>
                      assignment
                        .where("responsibility", "competition_coordinator")
                        .whereExists("membership", (membership) =>
                          membership
                            .where("editionId", args.editionId)
                            .where("userId", userId)
                            .where("state", "active")
                            .where("kind", "volunteer")
                        )
                    )
                  )
                )
              )
            )
          )
        )
        .orderBy("createdAt", "desc");
    }

    return query
      .where(({ and, cmp, exists, or }) =>
        or(
          exists("edition", (edition) =>
            edition
              .where("id", args.editionId)
              .whereExists("memberships", (membership) =>
                membership
                  .where("userId", userId)
                  .where("state", "active")
                  .where("kind", "volunteer")
                  .whereExists("assignments", (assignment) =>
                    assignment.where("responsibility", "edition_admin")
                  )
              )
          ),
          and(
            or(cmp("type", "breakfast"), cmp("type", "lunch")),
            exists("edition", (edition) =>
              edition.whereExists("memberships", (membership) =>
                membership
                  .where("userId", userId)
                  .where("state", "active")
                  .where("kind", "volunteer")
                  .whereExists("assignments", (assignment) =>
                    assignment.where("responsibility", "food_lead")
                  )
              )
            )
          ),
          and(
            cmp("type", "volunteer_check_in"),
            exists("membership", (targetMembership) =>
              targetMembership
                .where("state", "active")
                .where("kind", "volunteer")
                .whereExists("edition", (edition) =>
                  edition.whereExists("memberships", (membership) =>
                    membership
                      .where("userId", userId)
                      .where("state", "active")
                      .where("kind", "volunteer")
                      .whereExists("assignments", (assignment) =>
                        assignment.where("responsibility", "hospitality_lead")
                      )
                  )
                )
            )
          )
        )
      )
      .orderBy("createdAt", "desc");
  }),

  studentByHumanId: defineQuery(humanIdInput, ({ args, ctx }) => {
    const query = zql.kalakritiStudent
      .where("editionId", args.editionId)
      .where("humanId", args.humanId);
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.one();
    }
    if (!ctx?.userId) {
      return query.where("id", NO_ACCESS_ID).one();
    }

    const userId = ctx.userId;
    return query
      .where(({ exists, or }) =>
        or(
          exists("edition", (edition) =>
            edition.whereExists("memberships", (membership) =>
              membership
                .where("userId", userId)
                .where("state", "active")
                .where("kind", "volunteer")
                .whereExists("assignments", (assignment) =>
                  assignment.where(({ cmp, or: assignmentOr }) =>
                    assignmentOr(
                      cmp("responsibility", "edition_admin"),
                      cmp("responsibility", "transport_lead"),
                      cmp("responsibility", "food_lead")
                    )
                  )
                )
            )
          ),
          exists("center", (center) =>
            center.whereExists("assignments", (assignment) =>
              assignment
                .where("responsibility", "transport_coordinator")
                .whereExists("membership", (membership) =>
                  membership
                    .where("editionId", args.editionId)
                    .where("userId", userId)
                    .where("state", "active")
                    .where("kind", "volunteer")
                )
            )
          ),
          exists("entryMemberships", (entryMembership) =>
            entryMembership.whereExists("entry", (entry) =>
              entry.whereExists("division", (division) =>
                division.whereExists("competition", (competition) =>
                  competition.whereExists("assignments", (assignment) =>
                    assignment
                      .where("responsibility", "competition_coordinator")
                      .whereExists("membership", (membership) =>
                        membership
                          .where("editionId", args.editionId)
                          .where("userId", userId)
                          .where("state", "active")
                          .where("kind", "volunteer")
                      )
                  )
                )
              )
            )
          )
        )
      )
      .one();
  }),

  volunteerByHumanId: defineQuery(humanIdInput, ({ args, ctx }) => {
    const query = zql.kalakritiEditionMembership
      .where("editionId", args.editionId)
      .where("humanId", args.humanId)
      .where("kind", "volunteer")
      .where("state", "active");
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.one();
    }
    if (!ctx?.userId) {
      return query.where("id", NO_ACCESS_ID).one();
    }

    const userId = ctx.userId;
    return query
      .whereExists("edition", (edition) =>
        edition.whereExists("memberships", (membership) =>
          membership
            .where("userId", userId)
            .where("state", "active")
            .where("kind", "volunteer")
            .whereExists("assignments", (assignment) =>
              assignment.where(({ cmp, or }) =>
                or(
                  cmp("responsibility", "edition_admin"),
                  cmp("responsibility", "food_lead"),
                  cmp("responsibility", "hospitality_lead")
                )
              )
            )
        )
      )
      .one();
  }),
};
