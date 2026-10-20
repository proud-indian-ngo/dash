import { getKalakritiPublicSchedule as readKalakritiPublicSchedule } from "@pi-dash/db/queries/kalakriti-public-schedule";
import { createServerFn } from "@tanstack/react-start";

import { kalakritiPublicScheduleYearSchema } from "@/lib/kalakriti-public-schedule";
import { kalakritiPublicScheduleSchema } from "@/lib/kalakriti-public-schedule-schema";

const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
});

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function getTimeFormatter(timeZone: string) {
  let formatter = timeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    timeFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export const getKalakritiPublicSchedule = createServerFn({ method: "GET" })
  .validator(kalakritiPublicScheduleYearSchema)
  .handler(async ({ data: year }) => {
    const schedule = await readKalakritiPublicSchedule(year);
    if (!schedule) {
      return null;
    }
    const publicSchedule = kalakritiPublicScheduleSchema.parse(schedule);
    const timeFormatter = getTimeFormatter(publicSchedule.edition.timezone);
    const formattedTimes: Record<number, string> = {};
    for (const session of publicSchedule.sessions) {
      formattedTimes[session.startAt] = timeFormatter.format(session.startAt);
      formattedTimes[session.endAt] = timeFormatter.format(session.endAt);
    }

    return {
      ...publicSchedule,
      formattedEventDate: EVENT_DATE_FORMATTER.format(
        new Date(`${publicSchedule.edition.eventDate}T00:00:00Z`)
      ),
      formattedTimes,
      // Interest closes when the linked event is cancelled or starts, as in
      // eventInterest.create.
      interestClosed:
        schedule.edition.eventCancelled ||
        schedule.edition.eventStartAt <= Date.now(),
    };
  });
