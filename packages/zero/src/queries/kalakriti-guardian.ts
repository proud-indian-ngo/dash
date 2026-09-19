import { KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti";
import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

const editionInput = z.object({ editionId: z.string() });
const ALL_GUARDIAN_ROSTER_RESPONSIBILITIES = [
  "edition_admin",
  "volunteer_coordinator",
  "volunteer_management_volunteer",
] as const;
const GUARDIAN_ROSTER_RESPONSIBILITIES = [
  ...ALL_GUARDIAN_ROSTER_RESPONSIBILITIES,
  "liaison_lead",
  ...KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
] as const;

export const kalakritiGuardianQueries = {
  roster: defineQuery(editionInput, ({ args, ctx }) => {
    let query = zql.kalakritiEditionMembership
      .where("editionId", args.editionId)
      .where("kind", "guardian")
      .related("operations", (operations) =>
        operations
          .where("editionId", args.editionId)
          .where("type", "guardian_check_in")
      )
      .related("user");

    if (!(ctx !== null && can(ctx, "kalakriti.admin"))) {
      if (!(ctx && can(ctx, "kalakriti.view"))) {
        return query.where("id", "00000000-0000-0000-0000-000000000000");
      }
      query = query
        .whereExists("edition", (edition) =>
          edition
            .where("id", args.editionId)
            .where(({ or, and, cmp, exists }) =>
              or(
                exists("memberships", (membership) =>
                  membership
                    .where("userId", ctx.userId)
                    .where("kind", "volunteer")
                    .where("state", "active")
                    .whereExists("assignments", (assignment) =>
                      assignment.where("responsibility", "edition_admin")
                    )
                ),
                and(
                  cmp("lifecycle", "!=", "archived"),
                  exists("memberships", (membership) =>
                    membership
                      .where("userId", ctx.userId)
                      .where("kind", "volunteer")
                      .where("state", "active")
                      .whereExists("assignments", (assignment) =>
                        assignment.where(
                          "responsibility",
                          "IN",
                          GUARDIAN_ROSTER_RESPONSIBILITIES
                        )
                      )
                  )
                )
              )
            )
        )
        .where(({ or, exists }) =>
          or(
            exists("edition", (edition) =>
              edition
                .where("id", args.editionId)
                .whereExists("memberships", (membership) =>
                  membership
                    .where("userId", ctx.userId)
                    .where("kind", "volunteer")
                    .where("state", "active")
                    .whereExists("assignments", (assignment) =>
                      assignment.where(
                        "responsibility",
                        "IN",
                        ALL_GUARDIAN_ROSTER_RESPONSIBILITIES
                      )
                    )
                )
            ),
            exists("guardianCenters", (guardianCenter) =>
              guardianCenter
                .where("editionId", args.editionId)
                .where(({ or, exists }) =>
                  or(
                    exists("edition", (edition) =>
                      edition
                        .where("id", args.editionId)
                        .whereExists("memberships", (membership) =>
                          membership
                            .where("userId", ctx.userId)
                            .where("kind", "volunteer")
                            .where("state", "active")
                            .whereExists("assignments", (assignment) =>
                              assignment.where("responsibility", "liaison_lead")
                            )
                        )
                    ),
                    exists("center", (center) =>
                      center.whereExists("assignments", (assignment) =>
                        assignment
                          .where("editionId", args.editionId)
                          .where(
                            "responsibility",
                            "IN",
                            KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES
                          )
                          .whereExists("membership", (membership) =>
                            membership
                              .where("userId", ctx.userId)
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

    return query.orderBy("snapshotName", "asc");
  }),
};
