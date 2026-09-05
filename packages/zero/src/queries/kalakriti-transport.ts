import { KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti";
import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

const centerInput = z.object({
  centerId: z.string(),
  editionId: z.string(),
});
const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

export const kalakritiTransportQueries = {
  byCenter: defineQuery(centerInput, ({ args, ctx }) => {
    const query = zql.kalakritiTransportAssignment
      .where("editionId", args.editionId)
      .where("centerId", args.centerId);

    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("createdAt", "asc");
    }
    if (!(ctx && can(ctx, "kalakriti.view"))) {
      return query.where("id", NO_ACCESS_ID);
    }

    return query
      .whereExists("edition", (edition) =>
        edition
          .where("id", args.editionId)
          .whereExists("memberships", (membership) =>
            membership
              .where("userId", ctx.userId)
              .where("state", "active")
              .where("kind", "volunteer")
              .where(({ or, exists }) =>
                or(
                  exists("assignments", (assignment) =>
                    assignment.where(
                      ({ or: assignmentOr, cmp: assignmentCmp }) =>
                        assignmentOr(
                          assignmentCmp("responsibility", "edition_admin"),
                          assignmentCmp("responsibility", "transport_lead")
                        )
                    )
                  ),
                  exists("assignments", (assignment) =>
                    assignment
                      .where("centerId", args.centerId)
                      .where(({ or: assignmentOr, cmp: assignmentCmp }) =>
                        assignmentOr(
                          assignmentCmp(
                            "responsibility",
                            "transport_coordinator"
                          ),
                          ...KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES.map(
                            (responsibility) =>
                              assignmentCmp("responsibility", responsibility)
                          )
                        )
                      )
                  )
                )
              )
          )
      )
      .orderBy("createdAt", "asc");
  }),
};
