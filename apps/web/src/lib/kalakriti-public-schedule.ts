import * as z from "zod";

import type { KalakritiPublicSchedule } from "./kalakriti-public-schedule-schema";

export type { KalakritiPublicSchedule } from "./kalakriti-public-schedule-schema";

export const kalakritiPublicScheduleYearSchema = z.coerce
  .number()
  .int()
  .min(2000)
  .max(2200);

export function filterKalakritiPublicSchedule(
  sessions: KalakritiPublicSchedule["sessions"],
  filters: { ageCategory: string; category: string; venue: string }
) {
  return sessions.filter(
    (session) =>
      (!filters.venue || session.venue === filters.venue) &&
      (!filters.ageCategory || session.ageCategory === filters.ageCategory) &&
      (!filters.category || session.category === filters.category)
  );
}
