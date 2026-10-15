const eventWhenFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  hour: "numeric",
  hourCycle: "h12",
  minute: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata",
  weekday: "short",
});

/**
 * "Sat, 18 Oct, 10:00 am" in India time. Built from parts because ICU
 * versions differ in the joining words ("18 Oct at 10:00 AM" in some), and
 * this goes into sentences such as "on … at Cubbon Park".
 */
export function formatEventWhen(epochMs: number): string {
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of eventWhenFormat.formatToParts(
    new Date(epochMs)
  )) {
    part[type] = value;
  }
  const period = part.dayPeriod?.toLowerCase();
  return `${part.weekday}, ${part.day} ${part.month}, ${part.hour}:${part.minute}${period ? ` ${period}` : ""}`;
}
