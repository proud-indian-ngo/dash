import * as z from "zod";

export const kalakritiPublicScheduleYearSchema = z.coerce
  .number()
  .int()
  .min(2000)
  .max(2200);

export const kalakritiPublicScheduleSchema = z.object({
  edition: z.object({
    eventDate: z.iso.date(),
    eventId: z.string(),
    name: z.string(),
    timezone: z.string(),
    year: z.number().int(),
  }),
  sessions: z.array(
    z.object({
      ageCategory: z.string(),
      category: z.string(),
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
