import { format } from "date-fns";
import z from "zod";

const KOLKATA_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export const editionCalendarStart = new Date(2000, 0, 1);

export const registrationCloseTimeOptions = Array.from(
  { length: 96 },
  (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = (index % 4) * 15;
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return { label: value, value };
  }
);

export const editionMetadataFormFields = {
  ageCutoffDate: z.date({ error: "Choose an age cutoff date" }),
  brandingKey: z.string().trim().min(1, "Enter a branding key"),
  eventDate: z.date({ error: "Choose an event date" }),
  name: z.string().trim().min(1, "Enter an Edition name"),
  registrationCloseDate: z.date({
    error: "Choose the registration close date",
  }),
  registrationCloseTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose the registration close time"),
};

export function getRegistrationCloseTimestamp(
  date: Date,
  time: string
): number {
  return new Date(`${format(date, "yyyy-MM-dd")}T${time}:00+05:30`).getTime();
}

export function registrationClosesBeforeEvent(value: {
  eventDate: Date;
  registrationCloseDate: Date;
  registrationCloseTime: string;
}): boolean {
  return (
    getRegistrationCloseTimestamp(
      value.registrationCloseDate,
      value.registrationCloseTime
    ) < getRegistrationCloseTimestamp(value.eventDate, "00:00")
  );
}

export function calendarDateFromTimestamp(timestamp: number): Date {
  const date = new Date(timestamp);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function registrationCloseDefaults(timestamp: number): {
  date: Date;
  time: string;
} {
  const kolkata = new Date(timestamp + KOLKATA_OFFSET_MS);
  return {
    date: new Date(
      kolkata.getUTCFullYear(),
      kolkata.getUTCMonth(),
      kolkata.getUTCDate()
    ),
    time: `${String(kolkata.getUTCHours()).padStart(2, "0")}:${String(
      kolkata.getUTCMinutes()
    ).padStart(2, "0")}`,
  };
}
