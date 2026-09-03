import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

function canQueryEventDayOperations(
  userId: string | undefined,
  isAdmin: boolean
): boolean {
  return Boolean(isAdmin || userId);
}

export const kalakritiOperationQueries = {
  bySubject: defineQuery(
    z.object({
      editionId: z.string(),
      membershipId: z.string().optional(),
      studentId: z.string().optional(),
    }),
    ({ args, ctx }) => {
      if (
        !canQueryEventDayOperations(
          ctx?.userId,
          ctx !== null && can(ctx, "kalakriti.admin")
        )
      ) {
        return zql.kalakritiOperation
          .where("id", NO_ACCESS_ID)
          .orderBy("createdAt", "desc");
      }
      let query = zql.kalakritiOperation.where("editionId", args.editionId);
      if (args.studentId) {
        query = query.where("studentId", args.studentId);
      } else if (args.membershipId) {
        query = query.where("membershipId", args.membershipId);
      } else {
        query = query.where("id", NO_ACCESS_ID);
      }
      return query.orderBy("createdAt", "desc");
    }
  ),
  studentByHumanId: defineQuery(
    z.object({
      editionId: z.string(),
      humanId: z.string().min(1),
    }),
    ({ args, ctx }) => {
      if (
        !canQueryEventDayOperations(
          ctx?.userId,
          ctx !== null && can(ctx, "kalakriti.admin")
        )
      ) {
        return zql.kalakritiStudent.where("id", NO_ACCESS_ID).one();
      }
      return zql.kalakritiStudent
        .where("editionId", args.editionId)
        .where("humanId", args.humanId)
        .one();
    }
  ),
  volunteerByHumanId: defineQuery(
    z.object({
      editionId: z.string(),
      humanId: z.string().min(1),
    }),
    ({ args, ctx }) => {
      if (
        !canQueryEventDayOperations(
          ctx?.userId,
          ctx !== null && can(ctx, "kalakriti.admin")
        )
      ) {
        return zql.kalakritiEditionMembership.where("id", NO_ACCESS_ID).one();
      }
      return zql.kalakritiEditionMembership
        .where("editionId", args.editionId)
        .where("humanId", args.humanId)
        .where("kind", "volunteer")
        .one();
    }
  ),
};
