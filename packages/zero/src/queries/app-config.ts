import { defineQuery } from "@rocicorp/zero";
import { isExternalUser } from "../permissions";
import { zql } from "../schema";

export const appConfigQueries = {
  all: defineQuery(({ ctx }) =>
    isExternalUser(ctx)
      ? zql.appConfig.where("key", "__never_match__")
      : zql.appConfig.orderBy("key", "asc")
  ),
};
