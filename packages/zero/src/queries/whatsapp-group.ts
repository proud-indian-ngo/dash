import { defineQuery } from "@rocicorp/zero";
import { isExternalUser } from "../permissions";
import { zql } from "../schema";

export const whatsappGroupQueries = {
  all: defineQuery(({ ctx }) =>
    isExternalUser(ctx)
      ? zql.whatsappGroup.where("id", "__never_match__")
      : zql.whatsappGroup.orderBy("name", "asc")
  ),
};
