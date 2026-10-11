import { z } from "zod";

import {
  buildPublicSignUpUrl,
  type EventOccurrence,
  expandEventOccurrences,
  type PublicEventSourceRow,
  toIndiaDate,
  toPublicArea,
  toPublicProgramme,
  toPublicSummary,
} from "./public-events";
import { expandSeries, parseRecurrenceRule } from "./rrule-expand";

/**
 * Machine-facing social API (`/api/social/v1/*`) for the social-artifacts
 * pipeline. Contract: social-artifacts docs/strategy/dashboard-api-spec.md;
 * the consumer's TypeScript client is the source of truth for these shapes.
 */

export const SOCIAL_TIMEZONE = "Asia/Kolkata";
export const SOCIAL_EVENTS_MAX_DAYS = 120;
export const SOCIAL_PHOTOS_MAX = 12;
export const SOCIAL_NOTIFY_MAX_LINES = 40;
export const SOCIAL_NOTIFY_MAX_LINE_LENGTH = 500;
/** Programme reported when the team name does not reveal one. */
export const SOCIAL_UNKNOWN_PROGRAMME = "general";

export const socialEventStatusValues = [
  "scheduled",
  "completed",
  "cancelled",
] as const;
export type SocialEventStatus = (typeof socialEventStatusValues)[number];

export interface SocialPartner {
  instagram: string | null;
  linkedin: string | null;
  name: string;
}

export interface SocialEvent {
  area: string;
  attendance: { children: number; hours: number; volunteers: number } | null;
  city: string;
  /** "HH:mm" in India. */
  endTime: string;
  /**
   * Row id for standalone events and materialised exceptions;
   * `${seriesId}:${occurrenceDate}` (the series' date key) for a virtual
   * occurrence, so every week of a series has its own id.
   */
  id: string;
  name: string;
  /** Calendar date of the occurrence in India (YYYY-MM-DD). */
  occurrenceDate: string;
  partners: SocialPartner[];
  photos: { consentCleared: boolean; count: number | null } | null;
  programme: string;
  signUpUrl: string;
  socialNotes: string | null;
  /** "HH:mm" in India. */
  startTime: string;
  status: SocialEventStatus;
  summary: string;
  team: string;
  venue: { instagram: string | null; name: string };
  volunteers: { approved: number; needed: number; waitlisted: number };
}

export interface SocialEventsResponse {
  events: SocialEvent[];
  timezone: typeof SOCIAL_TIMEZONE;
}

export interface SocialPhoto {
  caption?: string | null;
  doNotUse: boolean;
  height: number;
  id: string;
  /** ISO 8601 UTC. */
  takenAt: string;
  thumbnailUrl: string;
  url: string;
  width: number;
}

export interface SocialMonthlyStats {
  allTime: { hours: number; optimists: number; reached: number };
  children: number;
  hours: number;
  month: string;
  newOptimists: number;
  partners: SocialPartner[];
  sessions: number;
  volunteers: number;
}

/** `team_event` source row plus the post-event social columns. */
export interface SocialEventSourceRow extends PublicEventSourceRow {
  childrenAttended: number | null;
  socialCompletedAt: number | null;
  socialNotes: string | null;
  volunteersNeeded: number | null;
}

/** Counts and partners for one materialised `team_event` row. */
export interface SocialEventFacts {
  approvedInterests: number;
  approvedPhotos: number;
  partners: SocialPartner[];
  pendingInterests: number;
  presentVolunteers: number;
}

const EMPTY_FACTS: SocialEventFacts = {
  approvedInterests: 0,
  approvedPhotos: 0,
  partners: [],
  pendingInterests: 0,
  presentVolunteers: 0,
};

export interface SocialEventsWindow {
  /** Window start, epoch ms: 00:00 India time on `from`. */
  from: number;
  /** Window end, epoch ms (inclusive): 23:59:59.999 India time on `to`. */
  to: number;
}

export class SocialApiQueryError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseIndiaDate(raw: string | null, name: string): number {
  const utcMidnight =
    raw && ISO_DATE_RE.test(raw) ? Date.parse(`${raw}T00:00:00Z`) : Number.NaN;
  // Date.parse rejects out-of-range fields (2026-13-01); the round trip
  // rejects days the month does not have (2026-02-30).
  if (
    Number.isNaN(utcMidnight) ||
    new Date(utcMidnight).toISOString().slice(0, 10) !== raw
  ) {
    throw new SocialApiQueryError(`${name} must be a date (YYYY-MM-DD)`);
  }
  return Date.parse(`${raw}T00:00:00+05:30`);
}

/**
 * Parse `from` and `to` (both required, India calendar dates, inclusive; at
 * most 120 days counting both ends). Unlike the public feed, `from` may be in the past. Throws
 * `SocialApiQueryError` on bad input.
 */
export function parseSocialEventsWindow(
  params: URLSearchParams
): SocialEventsWindow {
  const from = parseIndiaDate(params.get("from"), "from");
  const toDay = parseIndiaDate(params.get("to"), "to");
  if (toDay < from) {
    throw new SocialApiQueryError("to must not be before from");
  }
  // India has no DST, so whole days divide exactly; `from` and `to` both count.
  if ((toDay - from) / DAY_MS + 1 > SOCIAL_EVENTS_MAX_DAYS) {
    throw new SocialApiQueryError(
      `the window must be at most ${SOCIAL_EVENTS_MAX_DAYS} days, counting from and to inclusively`
    );
  }
  return { from, to: toDay + DAY_MS - 1 };
}

export interface SocialStatsMonth {
  /** Month start, epoch ms, India time. */
  from: number;
  month: string;
  /** Month end, epoch ms (inclusive), India time. */
  to: number;
}

/** Parse `month=YYYY-MM` into India-time month bounds. */
export function parseSocialStatsMonth(
  params: URLSearchParams
): SocialStatsMonth {
  const month = params.get("month");
  if (!(month && MONTH_RE.test(month))) {
    throw new SocialApiQueryError("month must be YYYY-MM");
  }
  const [year, monthIndex] = month.split("-").map(Number) as [number, number];
  const next =
    monthIndex === 12
      ? `${year + 1}-01`
      : `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return {
    from: Date.parse(`${month}-01T00:00:00+05:30`),
    month,
    to: Date.parse(`${next}-01T00:00:00+05:30`) - 1,
  };
}

const indiaTimeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  timeZone: SOCIAL_TIMEZONE,
});

/** "HH:mm" in India. */
export function toIndiaTime(epochMs: number): string {
  return indiaTimeFormat.format(new Date(epochMs));
}

/** Session length in hours, one decimal; open-ended sessions count zero. */
export function sessionHours(
  startTime: number,
  endTime: number | null
): number {
  if (endTime === null || endTime <= startTime) {
    return 0;
  }
  return Math.round(((endTime - startTime) / HOUR_MS) * 10) / 10;
}

/** Public, website-managed rows; cancelled ones stay so the pipeline can drop posts. */
function isSocialListed(row: SocialEventSourceRow): boolean {
  return row.isPublic && row.managementDomain === null;
}

/** Social feed id of a virtual occurrence: `${seriesId}:${occDate}`. */
export function virtualSocialEventId(seriesId: string, occDate: string) {
  return `${seriesId}:${occDate}`;
}

/**
 * Split a social event id into the series id and occurrence date when it is
 * the composite form of a virtual occurrence; null for a plain row id.
 */
export function parseVirtualSocialEventId(
  id: string
): { occDate: string; seriesId: string } | null {
  const separator = id.lastIndexOf(":");
  if (separator <= 0) {
    return null;
  }
  const occDate = id.slice(separator + 1);
  const seriesId = id.slice(0, separator);
  if (!ISO_DATE_RE.test(occDate) || seriesId.includes(":")) {
    return null;
  }
  return { occDate, seriesId };
}

/**
 * Occurrences a listed series' RRULE produces inside the window but its
 * `exdates` removed (and no exception row replaced). They are reported as
 * cancelled so the pipeline can drop posts already scheduled for them.
 * Occurrences removed by truncating the RRULE ("cancel following") cannot be
 * reconstructed, because the truncation overwrites the original UNTIL.
 */
function expandExdatedOccurrences(
  rows: readonly SocialEventSourceRow[],
  window: SocialEventsWindow
): EventOccurrence<SocialEventSourceRow>[] {
  const exceptionDates = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.seriesId && row.originalDate) {
      const dates = exceptionDates.get(row.seriesId) ?? new Set<string>();
      dates.add(row.originalDate);
      exceptionDates.set(row.seriesId, dates);
    }
  }
  const occurrences: EventOccurrence<SocialEventSourceRow>[] = [];
  for (const parent of rows) {
    const rule = parent.seriesId
      ? null
      : parseRecurrenceRule(parent.recurrenceRule);
    if (!(rule?.exdates?.length && isSocialListed(parent))) {
      continue;
    }
    const exdates = new Set(rule.exdates);
    for (const occ of expandSeries(
      { excludeRules: rule.excludeRules, rrule: rule.rrule },
      parent.startTime,
      parent.endTime,
      window.from,
      window.to,
      exceptionDates.get(parent.id)
    )) {
      if (
        exdates.has(occ.date) &&
        occ.startTime >= window.from &&
        occ.startTime <= window.to
      ) {
        occurrences.push({
          endTime: occ.endTime,
          id: parent.id,
          occDate: occ.date,
          parent,
          row: parent,
          startTime: occ.startTime,
          virtual: true,
        });
      }
    }
  }
  return occurrences;
}

/**
 * Social events for a window: every public, non-Kalakriti occurrence in both
 * cities, including cancelled ones (status "cancelled") and occurrences the
 * series' exdates removed (also "cancelled"). `facts` is keyed by
 * materialised `team_event` id; a virtual occurrence reads its series
 * parent's interests and partners, an exception row uses its own partners
 * when it has any, otherwise the parent's.
 */
export function buildSocialEvents(
  rows: readonly SocialEventSourceRow[],
  window: SocialEventsWindow,
  baseUrl: string,
  facts: ReadonlyMap<string, SocialEventFacts>
): SocialEvent[] {
  const factsFor = (id: string) => facts.get(id) ?? EMPTY_FACTS;
  const exdated = expandExdatedOccurrences(rows, window);
  const removed = new Set(exdated);
  const occurrences = [
    ...expandEventOccurrences(rows, {
      from: window.from,
      isListed: isSocialListed,
      to: window.to,
    }),
    ...exdated,
  ].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  return occurrences.map((occ) => {
    const { parent, row } = occ;
    const own = factsFor(row.id);
    const cancelled =
      removed.has(occ) ||
      row.cancelledAt !== null ||
      (parent?.cancelledAt ?? null) !== null;
    // A virtual occurrence has no row of its own, so it cannot be completed.
    const completed = !occ.virtual && row.socialCompletedAt !== null;
    let status: SocialEventStatus = "scheduled";
    if (cancelled) {
      status = "cancelled";
    } else if (completed) {
      status = "completed";
    }
    const partners =
      own.partners.length === 0 && parent && !occ.virtual
        ? factsFor(parent.id).partners
        : own.partners;
    return {
      area: toPublicArea(row.publicArea, row.city),
      attendance: completed
        ? {
            children: row.childrenAttended ?? 0,
            hours: sessionHours(occ.startTime, occ.endTime),
            volunteers: own.presentVolunteers,
          }
        : null,
      city: row.city,
      endTime: toIndiaTime(occ.endTime ?? occ.startTime),
      id:
        occ.virtual && occ.occDate
          ? virtualSocialEventId(occ.id, occ.occDate)
          : occ.id,
      name: row.name,
      occurrenceDate: toIndiaDate(occ.startTime),
      partners,
      photos: {
        consentCleared: false,
        count: completed ? own.approvedPhotos : null,
      },
      programme:
        toPublicProgramme(row.teamName, row.managementDomain) ??
        SOCIAL_UNKNOWN_PROGRAMME,
      // The register link keeps the series id + occurrence date form.
      signUpUrl: buildPublicSignUpUrl(baseUrl, occ.id, occ.occDate),
      socialNotes: completed ? row.socialNotes : null,
      startTime: toIndiaTime(occ.startTime),
      status,
      summary: toPublicSummary(row.description),
      team: row.teamName,
      venue: { instagram: null, name: row.publicArea?.trim() ?? "" },
      volunteers: {
        approved: own.approvedInterests,
        needed: row.volunteersNeeded ?? parent?.volunteersNeeded ?? 0,
        waitlisted: own.pendingInterests,
      },
    };
  });
}

/** A completed `team_event` row considered for the monthly stats. */
export interface SocialStatsSessionRow {
  cancelledAt: number | null;
  childrenAttended: number | null;
  endTime: number | null;
  id: string;
  isPublic: boolean;
  seriesId: string | null;
  startTime: number;
}

export interface SocialSessionsSummary {
  children: number;
  hours: number;
  partners: SocialPartner[];
  /** Ids of the counted sessions, for the volunteer count. */
  sessionIds: string[];
  sessions: number;
}

const partnerKey = (name: string) => name.trim().toLowerCase();

/**
 * Monthly session totals. Cancelled rows are not sessions. Private sessions
 * count towards sessions, children and hours, but their partners are not
 * published. An exception row without partners of its own credits its
 * series' partners; partners are de-duplicated by name, case-insensitively.
 */
export function summarizeSocialSessions(
  rows: readonly SocialStatsSessionRow[],
  partnersByEvent: ReadonlyMap<string, readonly SocialPartner[]>
): SocialSessionsSummary {
  const sessions = rows.filter((row) => row.cancelledAt === null);
  const partners = new Map<string, SocialPartner>();
  for (const session of sessions) {
    if (!session.isPublic) {
      continue;
    }
    const own = partnersByEvent.get(session.id) ?? [];
    const list =
      own.length === 0 && session.seriesId
        ? (partnersByEvent.get(session.seriesId) ?? [])
        : own;
    for (const partner of list) {
      const key = partnerKey(partner.name);
      if (!partners.has(key)) {
        partners.set(key, partner);
      }
    }
  }
  const hours = sessions.reduce(
    (sum, s) => sum + sessionHours(s.startTime, s.endTime),
    0
  );
  return {
    children: sessions.reduce((sum, s) => sum + (s.childrenAttended ?? 0), 0),
    hours: Math.round(hours * 10) / 10,
    partners: [...partners.values()],
    sessionIds: sessions.map((s) => s.id),
    sessions: sessions.length,
  };
}

/** Configured all-time overrides (app_config `social_all_time_*`). */
export const SOCIAL_ALL_TIME_CONFIG_KEYS = {
  hours: "social_all_time_hours",
  optimists: "social_all_time_optimists",
  reached: "social_all_time_reached",
} as const;

/** app_config key holding the user id whose phone receives the social digest. */
export const SOCIAL_APPROVER_CONFIG_KEY = "social_approver_user_id";

/**
 * Replace computed all-time figures with configured overrides. A value that
 * is not a non-negative finite number is ignored.
 */
export function applyAllTimeOverrides(
  computed: SocialMonthlyStats["allTime"],
  config: ReadonlyMap<string, string>
): SocialMonthlyStats["allTime"] {
  const pick = (field: keyof SocialMonthlyStats["allTime"]) => {
    const raw = config.get(SOCIAL_ALL_TIME_CONFIG_KEYS[field])?.trim();
    const value = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(value) && value >= 0 ? value : computed[field];
  };
  return {
    hours: pick("hours"),
    optimists: pick("optimists"),
    reached: pick("reached"),
  };
}

/** WhatsApp text for the social digest. */
export function formatSocialDigest(lines: readonly string[]): string {
  return `Social digest\n\n${lines.join("\n")}`;
}

/** app_config key: "true" pauses the whole pipeline (the hourly run does nothing). */
export const SOCIAL_PAUSED_CONFIG_KEY = "social_paused";
/** app_config key: comma-separated post kinds the pipeline skips. */
export const SOCIAL_PAUSED_KINDS_CONFIG_KEY = "social_paused_kinds";

/** Every post kind the pipeline knows; `story` is reserved. */
export const socialPostKinds = [
  "schedule",
  "recap",
  "volunteer-call",
  "impact",
  "story",
] as const;
export type SocialPostKindValue = (typeof socialPostKinds)[number];

/** Kinds the Social page offers a pause switch for (`story` is reserved). */
export const SOCIAL_PAUSABLE_KINDS = [
  "schedule",
  "recap",
  "volunteer-call",
  "impact",
] as const satisfies readonly SocialPostKindValue[];

/**
 * app_config key: JSON posting rules (`SocialRules`) the pipeline merges over
 * its own defaults. Only what an admin set is stored; absent = Worker default.
 */
export const SOCIAL_RULES_CONFIG_KEY = "social_rules";

export const SOCIAL_RULE_TEXT_MAX = 120;
const RULE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ruleTime = z
  .string({ error: "Use HH:MM (24-hour)" })
  .regex(RULE_TIME_RE, { error: "Use HH:MM (24-hour)" });
const ruleInt = (min: number, max: number) => {
  const error = `Use a whole number from ${min} to ${max}`;
  return z.number({ error }).int({ error }).min(min, { error }).max(max, {
    error,
  });
};
const ruleHeld = z.boolean({ error: "Use true or false" });
/** True when `text` has a control character (U+0000–U+001F, U+007F), e.g. a newline. */
function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

const ruleText = z
  .string({ error: `Use 1 to ${SOCIAL_RULE_TEXT_MAX} characters` })
  .trim()
  .min(1, { error: `Use 1 to ${SOCIAL_RULE_TEXT_MAX} characters` })
  .max(SOCIAL_RULE_TEXT_MAX, {
    error: `Use 1 to ${SOCIAL_RULE_TEXT_MAX} characters`,
  })
  .refine((text) => !hasControlCharacter(text), {
    error: "Use one line without control characters",
  });

const ROWS_RANGE = [1, 6] as const;
const PHOTOS_RANGE = [1, 12] as const;
const POST_DAYS_RANGE = [0, 6] as const;

/**
 * Effective value of a time field for a cross-field check: the value, or the
 * default when unset; null when the value is invalid, so the check is skipped
 * and only the field's own issue is reported.
 */
function crossTime(value: unknown, fallback: string): string | null {
  if (value === undefined) {
    return fallback;
  }
  return typeof value === "string" && RULE_TIME_RE.test(value) ? value : null;
}

/** As `crossTime`, for an integer field with its bounds. */
function crossInt(
  value: unknown,
  fallback: number,
  [min, max]: readonly [number, number]
): number | null {
  if (value === undefined) {
    return fallback;
  }
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

const minutesOf = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * The Worker's cron runs at the top of every hour, so the schedule is built
 * on the first HH:00 at or after `buildTime`, which must come before
 * `postTime`.
 */
export function hasHourMarkBetween(buildTime: string, postTime: string) {
  const firstHourMark = Math.ceil(minutesOf(buildTime) / 60) * 60;
  return firstHourMark < minutesOf(postTime);
}

/**
 * Display copy of the pipeline's own defaults (the Worker owns them). Used for
 * placeholders and for cross-field checks when only one side is set.
 */
export const SOCIAL_RULES_DEFAULTS = {
  impact: {
    buildTime: "09:00",
    held: true,
    line: "Thank you to every Optimist and partner who showed up.",
    postDaysAfterBuild: 2,
    postTime: "09:00",
  },
  recap: {
    closingLine: "Thank you for showing up",
    held: true,
    lookbackDays: 3,
    photosMax: 12,
    postTime: "20:00",
    reelMinSeconds: 15,
    slideshowMinPhotos: 3,
  },
  schedule: {
    buildTime: "09:00",
    held: false,
    maxRows: 6,
    minRows: 3,
    postTime: "19:00",
    title: "This week with Proud Indian",
  },
  story: { held: false },
  volunteerCall: { daysOut: 4, held: false, postTime: "19:00" },
} as const;

/** Posting rules, every field optional (`GET settings` → `rules`). */
export const socialRulesSchema = z.strictObject({
  impact: z
    .strictObject({
      buildTime: ruleTime,
      held: ruleHeld,
      line: ruleText,
      postDaysAfterBuild: ruleInt(...POST_DAYS_RANGE),
      postTime: ruleTime,
    })
    .partial()
    .refine(
      (impact) => {
        const days = crossInt(
          impact.postDaysAfterBuild,
          SOCIAL_RULES_DEFAULTS.impact.postDaysAfterBuild,
          POST_DAYS_RANGE
        );
        const buildTime = crossTime(
          impact.buildTime,
          SOCIAL_RULES_DEFAULTS.impact.buildTime
        );
        const postTime = crossTime(
          impact.postTime,
          SOCIAL_RULES_DEFAULTS.impact.postTime
        );
        if (days === null || buildTime === null || postTime === null) {
          return true;
        }
        return days > 0 || postTime > buildTime;
      },
      {
        error:
          "Post after the build time, or set post days after build to 1 or more",
        path: ["postTime"],
      }
    )
    .optional(),
  recap: z
    .strictObject({
      closingLine: ruleText,
      held: ruleHeld,
      lookbackDays: ruleInt(0, 14),
      photosMax: ruleInt(...PHOTOS_RANGE),
      postTime: ruleTime,
      reelMinSeconds: ruleInt(5, 60),
      slideshowMinPhotos: ruleInt(...PHOTOS_RANGE),
    })
    .partial()
    .refine(
      (recap) => {
        const most = crossInt(
          recap.photosMax,
          SOCIAL_RULES_DEFAULTS.recap.photosMax,
          PHOTOS_RANGE
        );
        const least = crossInt(
          recap.slideshowMinPhotos,
          SOCIAL_RULES_DEFAULTS.recap.slideshowMinPhotos,
          PHOTOS_RANGE
        );
        return most === null || least === null || most >= least;
      },
      { error: "Use at least the slideshow minimum", path: ["photosMax"] }
    )
    .optional(),
  schedule: z
    .strictObject({
      buildTime: ruleTime,
      held: ruleHeld,
      maxRows: ruleInt(...ROWS_RANGE),
      minRows: ruleInt(...ROWS_RANGE),
      postTime: ruleTime,
      title: ruleText,
    })
    .partial()
    .refine(
      (schedule) => {
        const least = crossInt(
          schedule.minRows,
          SOCIAL_RULES_DEFAULTS.schedule.minRows,
          ROWS_RANGE
        );
        const most = crossInt(
          schedule.maxRows,
          SOCIAL_RULES_DEFAULTS.schedule.maxRows,
          ROWS_RANGE
        );
        return least === null || most === null || least <= most;
      },
      { error: "Use at least the minimum rows", path: ["maxRows"] }
    )
    .refine(
      (schedule) => {
        const buildTime = crossTime(
          schedule.buildTime,
          SOCIAL_RULES_DEFAULTS.schedule.buildTime
        );
        const postTime = crossTime(
          schedule.postTime,
          SOCIAL_RULES_DEFAULTS.schedule.postTime
        );
        return buildTime === null || postTime === null || postTime > buildTime;
      },
      { error: "Post after the build time", path: ["postTime"] }
    )
    .refine(
      (schedule) => {
        const buildTime = crossTime(
          schedule.buildTime,
          SOCIAL_RULES_DEFAULTS.schedule.buildTime
        );
        const postTime = crossTime(
          schedule.postTime,
          SOCIAL_RULES_DEFAULTS.schedule.postTime
        );
        // Reported once: an inverted window already failed the check above.
        return (
          buildTime === null ||
          postTime === null ||
          postTime <= buildTime ||
          hasHourMarkBetween(buildTime, postTime)
        );
      },
      {
        error:
          "Leave a full hour (HH:00) from the build time until before the post time; the pipeline runs on the hour",
        path: ["postTime"],
      }
    )
    .optional(),
  story: z.strictObject({ held: ruleHeld }).partial().optional(),
  volunteerCall: z
    .strictObject({
      daysOut: ruleInt(1, 14),
      held: ruleHeld,
      postTime: ruleTime,
    })
    .partial()
    .optional(),
});
export type SocialRules = z.output<typeof socialRulesSchema>;
export type SocialRuleKind = keyof typeof SOCIAL_RULES_DEFAULTS;

export type SocialRulesParseResult =
  | { error: null; rules: SocialRules }
  | { error: string; rules: Record<string, never> };

/**
 * Stored `social_rules` JSON → rules. Missing is `{}` without an error; bad
 * JSON or a value outside the contract is `{}` with the reason, so a broken
 * value falls back to the pipeline defaults instead of failing the request.
 */
export function parseSocialRules(
  raw: string | null | undefined
): SocialRulesParseResult {
  if (!raw?.trim()) {
    return { error: null, rules: {} };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "social_rules is not valid JSON", rules: {} };
  }
  const parsed = socialRulesSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: `social_rules ${issue?.path.join(".") || "value"}: ${issue?.message ?? "invalid"}`,
      rules: {},
    };
  }
  return { error: null, rules: parsed.data };
}

/**
 * app_config keys holders of `social.manage` may write through
 * `appConfig.upsert` / `appConfig.remove` (everything else still needs
 * `settings.app_config`).
 */
export const SOCIAL_MANAGE_CONFIG_KEYS: readonly string[] = [
  SOCIAL_PAUSED_CONFIG_KEY,
  SOCIAL_PAUSED_KINDS_CONFIG_KEY,
  SOCIAL_APPROVER_CONFIG_KEY,
  ...Object.values(SOCIAL_ALL_TIME_CONFIG_KEYS),
  SOCIAL_RULES_CONFIG_KEY,
];

export interface SocialSettingsResponse {
  paused: boolean;
  pausedKinds: SocialPostKindValue[];
  rules: SocialRules;
}

const SOCIAL_POST_KIND_SET = new Set<string>(socialPostKinds);

/** Known kinds from a comma-separated list, deduplicated, in canonical order. */
export function parseSocialPausedKinds(
  raw: string | null | undefined
): SocialPostKindValue[] {
  const listed = new Set(
    (raw ?? "")
      .split(",")
      .map((kind) => kind.trim())
      .filter((kind) => SOCIAL_POST_KIND_SET.has(kind))
  );
  return socialPostKinds.filter((kind) => listed.has(kind));
}

/**
 * The settings the pipeline reads at the start of every run. An invalid
 * stored `social_rules` value yields `rules: {}` and is reported through
 * `onInvalidRules` (the API logs it) instead of failing.
 */
export function buildSocialSettings(
  config: ReadonlyMap<string, string>,
  onInvalidRules?: (reason: string) => void
): SocialSettingsResponse {
  const { error, rules } = parseSocialRules(
    config.get(SOCIAL_RULES_CONFIG_KEY)
  );
  if (error) {
    onInvalidRules?.(error);
  }
  return {
    paused: config.get(SOCIAL_PAUSED_CONFIG_KEY)?.trim() === "true",
    pausedKinds: parseSocialPausedKinds(
      config.get(SOCIAL_PAUSED_KINDS_CONFIG_KEY)
    ),
    rules,
  };
}

/** Run report limits (`POST /api/social/v1/runs`). */
export const SOCIAL_RUN_MAX_MESSAGES = 50;
export const SOCIAL_RUN_MAX_MESSAGE_LENGTH = 500;
/** Rows kept in `social_run`; older ones are deleted on insert. */
export const SOCIAL_RUN_RETENTION = 500;
export const socialRunTickValues = ["hourly", "digest"] as const;
export type SocialRunTick = (typeof socialRunTickValues)[number];
