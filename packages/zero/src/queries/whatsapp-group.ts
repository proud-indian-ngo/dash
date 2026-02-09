import { defineQuery } from "@rocicorp/zero";
import { zql } from "../schema";

export const whatsappGroupQueries = {
  all: defineQuery(() => zql.whatsappGroup.orderBy("name", "asc")),
};
