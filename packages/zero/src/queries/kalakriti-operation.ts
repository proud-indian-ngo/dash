import type { KalakritiResponsibility } from "@pi-dash/shared/kalakriti";
import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { can } from "../permissions";
import { zql } from "../schema";

const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";
const transportTypes = [
  "pickup",
  "venue_arrival",
  "venue_departure",
  "drop_off",
] as const;
const factTypes = [
  ...transportTypes,
  "volunteer_check_in",
  "breakfast",
  "lunch",
  "competition_attendance",
] as const;
const humanIdInput = z.object({
  editionId: z.uuid(),
  humanId: z.string().trim().min(1),
});
const subjectInput = z
  .object({
    editionId: z.uuid(),
    studentId: z.uuid().optional(),
    membershipId: z.uuid().optional(),
  })
  .refine(
    (args) => Boolean(args.studentId) !== Boolean(args.membershipId),
    "Choose exactly one subject"
  );

export function correctionOperations(
  editionId: string,
  ctx: Context | null | undefined,
  source = zql.kalakritiOperation
) {
  const query = source
    .where("editionId", editionId)
    .where("type", "IN", factTypes)
    .where(({ and, cmp, exists, or }) =>
      or(
        exists("student", (student) => student.where("editionId", editionId)),
        exists("membership", (membership) =>
          membership.where("editionId", editionId).where("kind", "volunteer")
        ),
        and(
          cmp("type", "IN", ["breakfast", "lunch"]),
          exists("membership", (membership) =>
            membership.where("editionId", editionId).where("kind", "guardian")
          )
        )
      )
    );
  if (!ctx?.userId) return query.where("id", NO_ACCESS_ID);
  if (can(ctx, "kalakriti.admin")) return query;
  const userId = ctx.userId;
  const editionRole = (
    edition: typeof zql.kalakritiEdition,
    responsibility: KalakritiResponsibility
  ) =>
    edition.where("id", editionId).whereExists("memberships", (membership) =>
      membership
        .where("editionId", editionId)
        .where("userId", userId)
        .where("kind", "volunteer")
        .where("state", "active")
        .whereExists("assignments", (assignment) =>
          assignment
            .where("editionId", editionId)
            .where("responsibility", responsibility)
        )
    );
  return query.where(({ and, cmp, exists, or }) =>
    or(
      exists("edition", (edition) => editionRole(edition, "edition_admin")),
      and(
        cmp("type", "IN", transportTypes),
        exists("edition", (edition) => editionRole(edition, "transport_lead"))
      ),
      and(
        cmp("type", "IN", ["breakfast", "lunch"]),
        exists("edition", (edition) => editionRole(edition, "food_lead"))
      ),
      and(
        cmp("type", "volunteer_check_in"),
        exists("edition", (edition) => editionRole(edition, "hospitality_lead"))
      ),
      and(
        cmp("type", "competition_attendance"),
        exists("session", (session) =>
          session
            .where("editionId", editionId)
            .whereExists("division", (division) =>
              division
                .where("editionId", editionId)
                .whereExists("competition", (competition) =>
                  competition
                    .where("editionId", editionId)
                    .whereExists("assignments", (assignment) =>
                      assignment
                        .where("editionId", editionId)
                        .where("responsibility", "competition_coordinator")
                        .whereExists("membership", (membership) =>
                          membership
                            .where("editionId", editionId)
                            .where("userId", userId)
                            .where("kind", "volunteer")
                            .where("state", "active")
                        )
                    )
                )
            )
        )
      )
    )
  );
}

function visibleCorrectionOperations(
  editionId: string,
  ctx: Context | null,
  source = zql.kalakritiOperation
) {
  const query = correctionOperations(editionId, ctx, source);
  return ctx && can(ctx, "kalakriti.admin")
    ? query
    : query.whereExists("edition", (edition) =>
        edition.where("lifecycle", "!=", "archived")
      );
}

export const kalakritiOperationQueries = {
  bySubject: defineQuery(subjectInput, ({ args, ctx }) => {
    let query = visibleCorrectionOperations(args.editionId, ctx);
    query = args.studentId
      ? query.where("studentId", args.studentId)
      : query.where("membershipId", args.membershipId ?? NO_ACCESS_ID);
    return query
      .related("session", (session) =>
        session
          .where("editionId", args.editionId)
          .related("division", (division) =>
            division
              .where("editionId", args.editionId)
              .related("competition", (competition) =>
                competition.where("editionId", args.editionId)
              )
          )
      )
      .related("supersededBy", (operation) =>
        operation.where("editionId", args.editionId)
      )
      .orderBy("createdAt", "desc");
  }),
  studentByHumanId: defineQuery(humanIdInput, ({ args, ctx }) =>
    zql.kalakritiStudent
      .where("editionId", args.editionId)
      .where(({ cmp, or }) =>
        z.uuid().safeParse(args.humanId).success
          ? or(cmp("humanId", args.humanId), cmp("id", args.humanId))
          : cmp("humanId", args.humanId)
      )
      .whereExists("operations", (operations) =>
        visibleCorrectionOperations(args.editionId, ctx, operations)
      )
      .one()
  ),
  membershipByHumanId: defineQuery(humanIdInput, ({ args, ctx }) =>
    zql.kalakritiEditionMembership
      .where("editionId", args.editionId)
      .where(({ cmp, or }) =>
        z.uuid().safeParse(args.humanId).success
          ? or(cmp("humanId", args.humanId), cmp("id", args.humanId))
          : cmp("humanId", args.humanId)
      )
      .whereExists("operations", (operations) =>
        visibleCorrectionOperations(args.editionId, ctx, operations)
      )
      .one()
  ),
};
