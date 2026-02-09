import { defineQuery } from "@rocicorp/zero";
import { zql } from "../schema";

export const appConfigQueries = {
  all: defineQuery(() => zql.appConfig.orderBy("key", "asc")),
};
