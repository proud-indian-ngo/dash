import {
  KALAKRITI_CENTER_SCAN_STAGES,
  KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
} from "@pi-dash/shared/kalakriti";
import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

export const kalakritiCenterScanQueries = {
  byCenter: defineQuery(
    z.object({ editionId: z.string(), centerId: z.string() }),
    ({ args, ctx }) => {
      let query = zql.kalakritiCenter
        .where("id", args.centerId)
        .where("editionId", args.editionId)
        .where("retiredAt", "IS", null)
        .whereExists("edition", (edition) =>
          edition.where("lifecycle", "!=", "archived")
        );
      if (!ctx)
        query = query.where("id", "00000000-0000-0000-0000-000000000000");
      else if (!can(ctx, "kalakriti.admin")) {
        query = query.whereExists("edition", (edition) =>
          edition
            .where("id", args.editionId)
            .whereExists("memberships", (membership) =>
              membership
                .where("editionId", args.editionId)
                .where("userId", ctx.userId)
                .where("state", "active")
                .where("kind", "volunteer")
                .whereExists("assignments", (assignment) =>
                  assignment
                    .where("editionId", args.editionId)
                    .where(({ or, and, cmp }) =>
                      or(
                        cmp("responsibility", "edition_admin"),
                        cmp("responsibility", "transport_lead"),
                        and(
                          cmp("centerId", args.centerId),
                          or(
                            ...KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES.map(
                              (role) => cmp("responsibility", role)
                            )
                          )
                        )
                      )
                    )
                )
            )
        );
      }
      return query
        .related("edition")
        .related("scanStages", (stages) =>
          stages.where("editionId", args.editionId)
        )
        .related("students", (students) =>
          students
            .where("editionId", args.editionId)
            .orderBy("name", "asc")
            .related("operations", (operations) =>
              operations
                .where("editionId", args.editionId)
                .where("type", "IN", KALAKRITI_CENTER_SCAN_STAGES)
            )
        )
        .one();
    }
  ),
};
