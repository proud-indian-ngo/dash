import { z } from "zod";

export const kalakritiPublicScheduleYearSchema = z.coerce
  .number()
  .int()
  .min(2000)
  .max(2200);

export const kalakritiPublicScheduleSchema = z.object({
  edition: z.object({
    eventDate: z.iso.date(),
    name: z.string(),
    timezone: z.string(),
    year: z.number().int(),
  }),
  sessions: z.array(
    z.object({
      ageCategory: z.string(),
      competition: z.string(),
      endAt: z.number().int().nonnegative(),
      startAt: z.number().int().nonnegative(),
      status: z.enum(["scheduled", "cancelled"]),
      venue: z.string(),
    })
  ),
});

export type KalakritiPublicSchedule = z.infer<
  typeof kalakritiPublicScheduleSchema
>;
