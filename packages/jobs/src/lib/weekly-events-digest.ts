import { format } from "date-fns";
import { enUS } from "date-fns/locale";

const IST_TIMEZONE = "Asia/Kolkata";

const istDatePartsFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "numeric",
  timeZone: IST_TIMEZONE,
  year: "numeric",
});

const istTimePartsFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  hourCycle: "h23",
  minute: "numeric",
  timeZone: IST_TIMEZONE,
});

export interface DigestEvent {
  endTime: number | null;
  location: string | null;
  name: string;
  startTime: number;
}

export interface DigestMessageOptions {
  ctaUrl?: string;
}

function getPartsMap(
  formatter: Intl.DateTimeFormat,
  epochMs: number
): Map<string, string> {
  return new Map(
    formatter
      .formatToParts(new Date(epochMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function getIstDateDisplayDate(epochMs: number): Date {
  const parts = getPartsMap(istDatePartsFormatter, epochMs);
  const year = Number(parts.get("year"));
  const month = Number(parts.get("month"));
  const day = Number(parts.get("day"));

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function getIstTimeDisplayDate(epochMs: number): Date {
  const parts = getPartsMap(istTimePartsFormatter, epochMs);
  const hour = Number(parts.get("hour"));
  const minute = Number(parts.get("minute"));

  return new Date(2000, 0, 1, hour, minute, 0, 0);
}

function formatEventDate(epochMs: number): string {
  return format(getIstDateDisplayDate(epochMs), "EEE, MMMM d", {
    locale: enUS,
  });
}

function formatEventTime(epochMs: number): string {
  const displayDate = getIstTimeDisplayDate(epochMs);
  const pattern = format(displayDate, "mm") === "00" ? "ha" : "h:mma";

  return format(displayDate, pattern, { locale: enUS }).toLowerCase();
}

function formatEventTimeRange(
  startTime: number,
  endTime: number | null
): string {
  const startLabel = formatEventTime(startTime);
  if (!endTime) {
    return `${startLabel} onwards`;
  }

  return `${startLabel} - ${formatEventTime(endTime)}`;
}

function formatDigestEvent(event: DigestEvent): string[] {
  const lines = [
    `*${event.name}*`,
    `🗓️ ${formatEventDate(event.startTime)}`,
    `⏰ ${formatEventTimeRange(event.startTime, event.endTime)}`,
  ];

  if (event.location) {
    lines.push(`📍 ${event.location}`);
  }

  return lines;
}

export function formatDigestMessage(
  events: DigestEvent[],
  options: DigestMessageOptions = {}
): string {
  const lines = ["*Upcoming Events This Week* 🌟", ""];

  for (const [index, event] of events.entries()) {
    lines.push(...formatDigestEvent(event));
    if (index < events.length - 1) {
      lines.push("");
    }
  }

  if (options.ctaUrl) {
    lines.push("");
    lines.push("Interested? View events and register your interest:");
    lines.push(options.ctaUrl);
  }

  return lines.join("\n");
}
