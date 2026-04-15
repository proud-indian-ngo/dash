import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

export const classEventStudentQueries = {
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.classEventStudent
        .where("eventId", eventId)
        .related("student", (s) => s.related("center"))
  ),
};
