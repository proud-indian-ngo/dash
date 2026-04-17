import { defineQuery } from "@rocicorp/zero";
import { zql } from "../schema";

export const notificationQueries = {
  forCurrentUser: defineQuery(({ ctx }) =>
    zql.notification
      .where("userId", ctx?.userId)
      .where("archived", false)
      .orderBy("createdAt", "desc")
      .limit(50)
  ),
};
