import { type City, cityValues } from "./constants";
import {
  expandSeries,
  findOccurrence,
  parseRecurrenceRule,
} from "./rrule-expand";

/**
 * Public events feed for proudindian.ngo (`GET /api/public/events`).
 * Contract: proud-indian-design/research/pi-dash-public-events-api.md.
 * Everything here is an allow-list: only the fields of `PublicEvent` ever leave pi-dash.
 */

export const publicProgrammeValues = [
  "community",
  "education",
  "kalakriti",
  "nutrition",
] as const;
export type PublicProgramme = (typeof publicProgrammeValues)[number];

export interface PublicEvent {
  area: string;
  city: string;
  endTime: string;
  /** Event id; for a virtual occurrence of a recurring series, the series id. */
  id: string;
  name: string;
  /** Calendar date of the occurrence in India (YYYY-MM-DD). */
  occurrenceDate: string;
  programme?: PublicProgramme;
  signUpUrl: string;
  startTime: string;
  summary: string;
  team: string;
}

export interface PublicEventsResponse {
  events: PublicEvent[];
  generatedAt: string;
}

/** Source row for one `team_event`. Only the columns the feed may read. */
export interface PublicEventSourceRow {
  cancelledAt: number | null;
  city: string;
  description: string | null;
  endTime: number | null;
  id: string;
  isPublic: boolean;
  managementDomain: string | null;
  name: string;
  originalDate: string | null;
  publicArea: string | null;
  recurrenceRule: unknown;
  seriesId: string | null;
  startTime: number;
  teamName: string;
}

export interface PublicEventsQuery {
  city: City;
  /** Window start, epoch ms (never before "now"). */
  from: number;
  limit: number;
  /** Window end, epoch ms (inclusive). */
  to: number;
}

export const PUBLIC_EVENTS_DEFAULT_DAYS = 30;
export const PUBLIC_EVENTS_MAX_DAYS = 90;
export const PUBLIC_EVENTS_DEFAULT_LIMIT = 20;
export const PUBLIC_EVENTS_MAX_LIMIT = 50;
export const PUBLIC_EVENTS_SUMMARY_MAX = 200;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER_RE = /^\d+$/;
const INDIA_TIMEZONE = "Asia/Kolkata";

const CITY_LABELS: Record<City, string> = {
  bangalore: "Bengaluru",
  mumbai: "Mumbai",
};

// Names an admin may already have typed into the area.
const CITY_ALIASES: Record<City, RegExp> = {
  bangalore: /\b(bengaluru|bangalore)\b/i,
  mumbai: /\b(mumbai|bombay)\b/i,
};

export class PublicEventsQueryError extends Error {}

function parseBoundedInt(
  raw: string | null,
  name: string,
  fallback: number,
  max: number
): number {
  if (raw === null || raw === "") {
    return fallback;
  }
  if (!INTEGER_RE.test(raw) || Number(raw) < 1) {
    throw new PublicEventsQueryError(`${name} must be a positive integer`);
  }
  return Math.min(Number(raw), max);
}

function parseFrom(raw: string | null, now: number): number {
  if (raw === null || raw === "") {
    return now;
  }
  // A bare date means the start of that day in India, where every session runs.
  const parsed = Date.parse(
    ISO_DATE_RE.test(raw) ? `${raw}T00:00:00+05:30` : raw
  );
  if (Number.isNaN(parsed)) {
    throw new PublicEventsQueryError("from must be an ISO date");
  }
  // Bound the expansion window: a far-future `from` would make RRULE
  // expansion walk every occurrence up to it.
  if (parsed > now + PUBLIC_EVENTS_MAX_DAYS * DAY_MS) {
    throw new PublicEventsQueryError(
      `from must be within ${PUBLIC_EVENTS_MAX_DAYS} days`
    );
  }
  // Upcoming events only: a past `from` is clamped to now.
  return Math.max(parsed, now);
}

/** Parse and clamp query params. Throws `PublicEventsQueryError` on bad input. */
export function parsePublicEventsQuery(
  params: URLSearchParams,
  now: number
): PublicEventsQuery {
  const rawCity = params.get("city") || "bangalore";
  if (!(cityValues as readonly string[]).includes(rawCity)) {
    throw new PublicEventsQueryError(
      `city must be one of ${cityValues.join(", ")}`
    );
  }
  const from = parseFrom(params.get("from"), now);
  const days = parseBoundedInt(
    params.get("days"),
    "days",
    PUBLIC_EVENTS_DEFAULT_DAYS,
    PUBLIC_EVENTS_MAX_DAYS
  );
  const limit = parseBoundedInt(
    params.get("limit"),
    "limit",
    PUBLIC_EVENTS_DEFAULT_LIMIT,
    PUBLIC_EVENTS_MAX_LIMIT
  );
  return { city: rawCity as City, from, limit, to: from + days * DAY_MS };
}

const HTML_TAG_RE = /<[^>]*>/g;
const MD_IMAGE_RE = /!\[([^\]]*)\]\([^)]*\)/g;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Digit runs with spaces, dashes, dots or brackets; only phone-shaped ones
// (10+ digits, or a leading +) are removed so times and dates survive.
const PHONE_CANDIDATE_RE = /\+?\(?\d[\d\s().-]{5,}\d/g;
const PHONE_MIN_DIGITS = 10;
const NON_DIGIT_RE = /\D/g;
// Punctuation left dangling where a link, email or phone number was removed.
const ORPHAN_PUNCTUATION_RE = /\s+([.,;:!?)])/g;
const EMPTY_BRACKETS_RE = /\(\s*\)/g;
const MD_LINE_PREFIX_RE = /^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm;
const MD_EMPHASIS_RE = /(\*\*|__|\*|_|~~|`)/g;
const WHITESPACE_RE = /\s+/g;
const TRAILING_PUNCTUATION_RE = /[\s,;:.–—-]+$/;

/**
 * Plain-text summary of a free-text description: strips HTML and markdown, removes links,
 * emails and phone numbers, and truncates to about 200 characters on a word boundary.
 */
export function toPublicSummary(description: string | null): string {
  if (!description) {
    return "";
  }
  const text = description
    .replace(HTML_TAG_RE, " ")
    .replace(MD_IMAGE_RE, "$1")
    .replace(MD_LINK_RE, "$1")
    .replace(URL_RE, " ")
    .replace(EMAIL_RE, " ")
    .replace(PHONE_CANDIDATE_RE, (match) =>
      match.startsWith("+") ||
      match.replace(NON_DIGIT_RE, "").length >= PHONE_MIN_DIGITS
        ? " "
        : match
    )
    .replace(EMPTY_BRACKETS_RE, " ")
    .replace(MD_LINE_PREFIX_RE, "")
    .replace(MD_EMPHASIS_RE, "")
    .replace(WHITESPACE_RE, " ")
    .replace(ORPHAN_PUNCTUATION_RE, "$1")
    .trim();
  if (text.length <= PUBLIC_EVENTS_SUMMARY_MAX) {
    return text;
  }
  const cut = text.slice(0, PUBLIC_EVENTS_SUMMARY_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base =
    lastSpace > PUBLIC_EVENTS_SUMMARY_MAX / 2 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(TRAILING_PUNCTUATION_RE, "")}…`;
}

/** Coarse public area: the admin-set `publicArea` plus the city, never the raw location. */
export function toPublicArea(publicArea: string | null, city: string): string {
  const cityLabel = CITY_LABELS[city as City] ?? city;
  const area = publicArea?.trim();
  if (!area) {
    return cityLabel;
  }
  const alias = CITY_ALIASES[city as City];
  const mentionsCity = alias
    ? alias.test(area)
    : area.toLowerCase().includes(cityLabel.toLowerCase());
  return mentionsCity ? area : `${area}, ${cityLabel}`;
}

const PROGRAMME_KEYWORDS: [PublicProgramme, RegExp][] = [
  ["kalakriti", /kalakriti/i],
  ["nutrition", /nutrition|food|meal/i],
  ["education", /educat|teach|class|learn|school/i],
  ["community", /community/i],
];

/** Optional colour-coding hint for the website, derived from the team name. */
export function toPublicProgramme(
  teamName: string,
  managementDomain: string | null
): PublicProgramme | undefined {
  if (managementDomain === "kalakriti") {
    return "kalakriti";
  }
  return PROGRAMME_KEYWORDS.find(([, re]) => re.test(teamName))?.[0];
}

const indiaDateFormat = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: INDIA_TIMEZONE,
  year: "numeric",
});

function toIndiaDate(epochMs: number): string {
  return indiaDateFormat.format(new Date(epochMs));
}

export function buildPublicSignUpUrl(
  baseUrl: string,
  eventId: string,
  occDate?: string
): string {
  const url = new URL("/register", baseUrl);
  url.searchParams.set("interestEventId", eventId);
  if (occDate) {
    url.searchParams.set("occDate", occDate);
  }
  return url.toString();
}

interface Occurrence {
  endTime: number | null;
  id: string;
  /** Series occurrence key, only for virtual occurrences. */
  occDate?: string;
  row: PublicEventSourceRow;
  startTime: number;
}

function toPublicEvent(occ: Occurrence, baseUrl: string): PublicEvent {
  const { row } = occ;
  const programme = toPublicProgramme(row.teamName, row.managementDomain);
  return {
    area: toPublicArea(row.publicArea, row.city),
    city: row.city,
    // The contract requires an end time; open-ended events end when they start.
    endTime: new Date(occ.endTime ?? occ.startTime).toISOString(),
    id: occ.id,
    name: row.name,
    occurrenceDate: toIndiaDate(occ.startTime),
    ...(programme ? { programme } : {}),
    signUpUrl: buildPublicSignUpUrl(baseUrl, occ.id, occ.occDate),
    startTime: new Date(occ.startTime).toISOString(),
    summary: toPublicSummary(row.description),
    team: row.teamName,
  };
}

function isListed(row: PublicEventSourceRow, city: City): boolean {
  return (
    row.isPublic &&
    row.cancelledAt === null &&
    row.city === city &&
    // Kalakriti runs its own Center-based registration; not on the website.
    row.managementDomain !== "kalakriti"
  );
}

/**
 * Turn standalone events, series parents and their exception rows into the public feed:
 * expands recurring series, applies exdates and exception rows, keeps only public,
 * non-cancelled occurrences that start inside the window, sorted by start time.
 */
export function buildPublicEvents(
  rows: readonly PublicEventSourceRow[],
  query: PublicEventsQuery,
  baseUrl: string
): PublicEvent[] {
  const inWindow = (start: number) => start >= query.from && start <= query.to;
  const parents = new Map<string, PublicEventSourceRow>();
  const exceptionsBySeries = new Map<string, PublicEventSourceRow[]>();
  const occurrences: Occurrence[] = [];

  for (const row of rows) {
    if (row.seriesId) {
      const list = exceptionsBySeries.get(row.seriesId) ?? [];
      list.push(row);
      exceptionsBySeries.set(row.seriesId, list);
    } else if (parseRecurrenceRule(row.recurrenceRule)) {
      parents.set(row.id, row);
    } else if (isListed(row, query.city) && inWindow(row.startTime)) {
      occurrences.push({
        endTime: row.endTime,
        id: row.id,
        row,
        startTime: row.startTime,
      });
    }
  }

  for (const parent of parents.values()) {
    // A cancelled or private series hides every occurrence, including exceptions.
    if (!isListed(parent, query.city)) {
      continue;
    }
    const exceptions = exceptionsBySeries.get(parent.id) ?? [];
    // Every exception row (cancelled ones too) replaces its virtual occurrence.
    const exceptionDates = new Set(
      exceptions.flatMap((e) => (e.originalDate ? [e.originalDate] : []))
    );
    const rule = parseRecurrenceRule(parent.recurrenceRule);
    if (rule) {
      for (const occ of expandSeries(
        rule,
        parent.startTime,
        parent.endTime,
        query.from,
        query.to,
        exceptionDates
      )) {
        if (inWindow(occ.startTime)) {
          occurrences.push({
            endTime: occ.endTime,
            id: parent.id,
            occDate: occ.date,
            row: parent,
            startTime: occ.startTime,
          });
        }
      }
    }
    for (const exception of exceptions) {
      if (isListed(exception, query.city) && inWindow(exception.startTime)) {
        occurrences.push({
          endTime: exception.endTime,
          id: exception.id,
          // Exceptions inherit the series' public area unless they set their own.
          row: {
            ...exception,
            publicArea: exception.publicArea?.trim()
              ? exception.publicArea
              : parent.publicArea,
          },
          startTime: exception.startTime,
        });
      }
    }
  }

  return occurrences
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))
    .slice(0, query.limit)
    .map((occ) => toPublicEvent(occ, baseUrl));
}

export interface PublicSessionSummary {
  area: string;
  name: string;
  /** Whether the session still takes sign-ups (listed and not started). */
  open: boolean;
  startTime: string;
}

/**
 * What the register page may show about a website sign-up link: only public,
 * non-Kalakriti events, so it reveals nothing the feed does not. `exception`
 * is the materialized row for `occDate` of a recurring series, if any.
 */
export function summarizePublicSession(
  event: PublicEventSourceRow | null,
  exception: PublicEventSourceRow | null,
  occDate: string | undefined,
  now: number
): PublicSessionSummary | null {
  if (!event?.isPublic || event.managementDomain === "kalakriti") {
    return null;
  }
  const summary = (row: PublicEventSourceRow, startTime: number) => ({
    area: toPublicArea(
      row.publicArea?.trim() ? row.publicArea : event.publicArea,
      row.city
    ),
    name: row.name,
    open:
      row.isPublic &&
      row.cancelledAt === null &&
      event.cancelledAt === null &&
      startTime > now,
    startTime: new Date(startTime).toISOString(),
  });
  const rule = parseRecurrenceRule(event.recurrenceRule);
  if (!rule) {
    return summary(event, event.startTime);
  }
  if (!occDate) {
    return null;
  }
  if (exception) {
    return summary(exception, exception.startTime);
  }
  const occurrence = findOccurrence(
    rule,
    event.startTime,
    event.endTime,
    occDate
  );
  return occurrence ? summary(event, occurrence.startTime) : null;
}
