import { getKalakritiPublicSchedule as readKalakritiPublicSchedule } from "@pi-dash/db/queries/kalakriti-public-schedule";
import { createServerFn } from "@tanstack/react-start";
import {
  kalakritiPublicScheduleSchema,
  kalakritiPublicScheduleYearSchema,
} from "@/lib/kalakriti-public-schedule";

export const getKalakritiPublicSchedule = createServerFn({ method: "GET" })
  .validator(kalakritiPublicScheduleYearSchema)
  .handler(async ({ data: year }) => {
    const schedule = await readKalakritiPublicSchedule(year);
    return schedule ? kalakritiPublicScheduleSchema.parse(schedule) : null;
  });
