// @ts-nocheck
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  isValid,
  parse,
  startOfDay,
} from "date-fns"

/**
 * A date filter value.
 *
 * Deliberately NOT a `Date`.
 *
 * A filter is usually persisted: saved views, shared URLs, a column preset a
 * team keeps for months. Storing a resolved `Date` freezes the intent at the
 * moment it was written, so a view someone saved meaning "created today" still
 * means 14 August next March. Storing the TOKEN and resolving it at read time
 * keeps "today" meaning today, which is what the user actually asked for.
 *
 * An absolute pick still stores an absolute date, because "on 14 August" does
 * mean that one day.
 */
export interface FilterDateValue {
  /** An absolute day, `yyyy-MM-dd`. Mutually exclusive with `relative`. */
  date?: string
  /** A token re-resolved on every read. */
  relative?: FilterRelativeDate
  /** Optional time of day, `HH:mm`. */
  time?: string
}

/** A calendar offset from now, resolved at read time. */
export interface FilterRelativeDate {
  unit: "day" | "week" | "month" | "year"
  offset: number
}

export const FILTER_DATE_FORMAT = "yyyy-MM-dd"

export const RELATIVE_TODAY: FilterRelativeDate = { unit: "day", offset: 0 }
export const RELATIVE_TOMORROW: FilterRelativeDate = { unit: "day", offset: 1 }
export const RELATIVE_YESTERDAY: FilterRelativeDate = { unit: "day", offset: -1 }
export const RELATIVE_NEXT_WEEK: FilterRelativeDate = { unit: "week", offset: 1 }

/** Applies a relative token to a reference instant. */
export function applyFilterRelative(
  relative: FilterRelativeDate,
  now: Date
): Date {
  const base = startOfDay(now)
  if (relative.unit === "day") return addDays(base, relative.offset)
  if (relative.unit === "week") return addWeeks(base, relative.offset)
  if (relative.unit === "month") return addMonths(base, relative.offset)
  return addYears(base, relative.offset)
}

/** The concrete day a value points at, or null when it points at nothing. */
export function resolveFilterDate(
  value: FilterDateValue | undefined,
  now: Date = new Date()
): Date | null {
  if (!value) return null
  if (value.relative) return applyFilterRelative(value.relative, now)
  if (value.date) {
    const parsed = parse(value.date, FILTER_DATE_FORMAT, now)
    return isValid(parsed) ? parsed : null
  }
  return null
}

/** Builds an absolute value from a picked day. */
export function toFilterDateValue(
  date: Date,
  time?: string
): FilterDateValue {
  const value: FilterDateValue = { date: format(date, FILTER_DATE_FORMAT) }
  if (time) value.time = time
  return value
}

/* -------------------------------------------------------------------------- */
/*                            Natural language input                          */
/* -------------------------------------------------------------------------- */

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]

/**
 * Formats accepted from the typed input, most specific first.
 *
 * `date-selector.tsx` already parses typed text, but ONLY against explicit
 * formats like these: it has no notion of "next tuesday". So the natural
 * language half below is genuinely new work rather than something to import.
 */
const EXPLICIT_FORMATS = [
  "yyyy-MM-dd",
  "MM/dd/yyyy",
  "M/d/yyyy",
  "dd/MM/yyyy",
  "MMMM d, yyyy",
  "MMM d, yyyy",
  "MMMM d",
  "MMM d",
  "d MMMM yyyy",
  "d MMM yyyy",
]

/**
 * Parses a typed phrase into a date value.
 *
 * Returns a RELATIVE value for relative phrasing and an ABSOLUTE one for an
 * explicit date, because that distinction is the user's intent and throwing it
 * away is what freezes saved views. Returns null when nothing matched, so the
 * caller can leave the input alone rather than guessing.
 */
export function parseFilterDate(
  text: string,
  now: Date = new Date()
): FilterDateValue | null {
  const input = text.trim().toLowerCase().replace(/\s+/g, " ")
  if (!input) return null

  if (input === "today" || input === "now") return { relative: RELATIVE_TODAY }
  if (input === "tomorrow") return { relative: RELATIVE_TOMORROW }
  if (input === "yesterday") return { relative: RELATIVE_YESTERDAY }

  // "next week" / "last month" / "next year"
  const nextLast = input.match(/^(next|last|this) (day|week|month|year)$/)
  if (nextLast) {
    const direction =
      nextLast[1] === "next" ? 1 : nextLast[1] === "last" ? -1 : 0
    return {
      relative: {
        unit: nextLast[2] as FilterRelativeDate["unit"],
        offset: direction,
      },
    }
  }

  // "in 3 days" / "3 days ago" / "in 2 weeks"
  const counted = input.match(
    /^(?:in )?(\d+) (day|week|month|year)s?(?: ago)?$/
  )
  if (counted) {
    const magnitude = Number.parseInt(counted[1], 10)
    const past = input.endsWith("ago")
    return {
      relative: {
        unit: counted[2] as FilterRelativeDate["unit"],
        offset: past ? -magnitude : magnitude,
      },
    }
  }

  // "next tuesday" / "last friday" / bare "tuesday"
  const weekday = input.match(/^(?:(next|last|this) )?([a-z]+)$/)
  if (weekday) {
    const index = WEEKDAYS.indexOf(weekday[2])
    if (index !== -1) {
      const today = startOfDay(now)
      const current = today.getDay()
      let delta = index - current
      const qualifier = weekday[1]

      if (qualifier === "last") {
        // Always strictly in the past.
        if (delta >= 0) delta -= 7
      } else {
        // "next tuesday" and a bare "tuesday" both mean the NEXT one. A delta
        // of 0 would resolve to today, which is not what either phrase means.
        if (delta <= 0) delta += 7
      }

      return { relative: { unit: "day", offset: delta } }
    }
  }

  for (const pattern of EXPLICIT_FORMATS) {
    const parsed = parse(input, pattern, now)
    if (isValid(parsed)) {
      // A format with no year defaults to the reference year, which is what a
      // user typing "Aug 14" means.
      return toFilterDateValue(parsed)
    }
  }

  return null
}

/**
 * Human wording for a value.
 *
 * Relative values render as their phrase rather than as the resolved day, so a
 * chip reading "Created at is today" keeps saying "today" instead of silently
 * becoming a date that will be wrong tomorrow.
 */
export function formatFilterDate(
  value: FilterDateValue | undefined,
  now: Date = new Date(),
  pattern = "MMM d, yyyy"
): string {
  if (!value) return ""

  if (value.relative) {
    const { unit, offset } = value.relative
    if (unit === "day" && offset === 0) return "today"
    if (unit === "day" && offset === 1) return "tomorrow"
    if (unit === "day" && offset === -1) return "yesterday"

    const plural = Math.abs(offset) === 1 ? unit : `${unit}s`
    if (offset > 0) return `in ${offset} ${plural}`
    if (offset < 0) return `${Math.abs(offset)} ${plural} ago`
    return `this ${unit}`
  }

  const resolved = resolveFilterDate(value, now)
  if (!resolved) return ""
  const day = format(resolved, pattern)
  return value.time ? `${day} ${value.time}` : day
}

/** Whether a time string is a well formed `HH:mm`. */
export function isFilterTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}
