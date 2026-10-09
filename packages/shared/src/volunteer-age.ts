/** Volunteers must be adults to self-register. */
export const MIN_VOLUNTEER_AGE = 18;

export const MIN_VOLUNTEER_AGE_MESSAGE = `You must be at least ${MIN_VOLUNTEER_AGE} years old to register as a volunteer`;

/** Earliest birth year accepted; matches the date picker's first month. */
export const MIN_DOB_YEAR = 1900;

const DAY_MS = 24 * 60 * 60 * 1000;

interface CalendarDate {
  day: number;
  month: number;
  year: number;
}

function calendarDate(date: Date, utc: boolean): CalendarDate {
  return utc
    ? {
        day: date.getUTCDate(),
        month: date.getUTCMonth(),
        year: date.getUTCFullYear(),
      }
    : { day: date.getDate(), month: date.getMonth(), year: date.getFullYear() };
}

/** Whole years between a date of birth and `today`, by calendar date. */
export function ageInYears(dob: Date, today: Date, { utc = false } = {}) {
  const birth = calendarDate(dob, utc);
  const now = calendarDate(today, utc);
  const hadBirthday =
    now.month > birth.month ||
    (now.month === birth.month && now.day >= birth.day);
  return now.year - birth.year - (hadBirthday ? 0 : 1);
}

/** Client check, in the browser's local calendar. */
export function isVolunteerAgeEligible(dob: Date, today: Date) {
  return ageInYears(dob, today) >= MIN_VOLUNTEER_AGE;
}

/**
 * Server check. Pickers send local midnight, which reads as a different UTC
 * day for any non-UTC browser, so the server allows one day of slack: it may
 * accept someone a day short of 18 but never rejects a date the form allows.
 */
export function isVolunteerAgeEligibleOnServer(dob: Date, now: Date) {
  const tomorrow = new Date(now.getTime() + DAY_MS);
  return ageInYears(dob, tomorrow, { utc: true }) >= MIN_VOLUNTEER_AGE;
}

/** Latest date of birth a picker should offer, in local time. */
export function latestVolunteerDob(today: Date) {
  return new Date(
    today.getFullYear() - MIN_VOLUNTEER_AGE,
    today.getMonth(),
    today.getDate()
  );
}
