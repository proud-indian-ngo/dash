const eventDayFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
  weekday: "short",
});

/**
 * "Maths class (Sat, 18 Oct)": the event's name with its session date in
 * India time, so sessions of a series, or events sharing a name, read apart.
 * Built from parts because ICU versions differ in the joining punctuation.
 */
export function eventLabel(eventName: string, startTime: number): string {
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of eventDayFormat.formatToParts(
    new Date(startTime)
  )) {
    part[type] = value;
  }
  return `${eventName} (${part.weekday}, ${part.day} ${part.month})`;
}
