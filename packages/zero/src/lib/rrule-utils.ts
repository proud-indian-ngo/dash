import { RRule, rrulestr } from "rrule";

const RRULE_PREFIX_RE = /^RRULE:/;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseRRule(rruleString: string): RRule {
  return rrulestr(rruleString) as RRule;
}

// ---------------------------------------------------------------------------
// RRULE ↔ UI helpers
// ---------------------------------------------------------------------------

export interface RRuleFormState {
  byDay: number[]; // RRule weekday constants (0=MO, 1=TU, ..., 6=SU)
  bySetPos?: number; // For "nth weekday of month" (1=first, -1=last)
  count?: number;
  endType: "never" | "count" | "until";
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  until?: string; // ISO date
}

const FREQ_MAP: Record<number, RRuleFormState["frequency"]> = {
  [RRule.DAILY]: "daily",
  [RRule.WEEKLY]: "weekly",
  [RRule.MONTHLY]: "monthly",
  [RRule.YEARLY]: "yearly",
};

const FREQ_REVERSE: Record<string, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

/** Parse an RRULE string into form-friendly state. */
export function rruleToFormState(rruleString: string): RRuleFormState {
  const rule = parseRRule(rruleString);
  const opts = rule.origOptions;

  const frequency = FREQ_MAP[opts.freq ?? RRule.WEEKLY] ?? "weekly";
  const interval = opts.interval ?? 1;

  let byDay: number[] = [];
  if (opts.byweekday) {
    const days = Array.isArray(opts.byweekday)
      ? opts.byweekday
      : [opts.byweekday];
    byDay = days.map((d) => {
      if (typeof d === "number") {
        return d;
      }
      if (typeof d === "object" && "weekday" in d) {
        return d.weekday;
      }
      return 0;
    });
  }

  let bySetPos: number | undefined;
  if (opts.bysetpos != null) {
    bySetPos = Array.isArray(opts.bysetpos) ? opts.bysetpos[0] : opts.bysetpos;
  }

  let endType: RRuleFormState["endType"] = "never";
  let count: number | undefined;
  let until: string | undefined;

  if (opts.count != null) {
    endType = "count";
    count = opts.count;
  } else if (opts.until != null) {
    endType = "until";
    until = toISODateUTC(opts.until);
  }

  return { frequency, interval, byDay, bySetPos, endType, count, until };
}

/** Convert form state back into an RRULE string. */
export function formStateToRRule(
  state: RRuleFormState,
  dtstart?: Date
): string {
  const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
    freq: FREQ_REVERSE[state.frequency] ?? RRule.WEEKLY,
    interval: state.interval > 1 ? state.interval : undefined,
    ...(dtstart ? { dtstart } : {}),
  };

  if (state.byDay.length > 0) {
    options.byweekday = state.byDay;
  }

  if (state.bySetPos != null) {
    options.bysetpos = state.bySetPos;
  }

  if (state.endType === "count" && state.count != null) {
    options.count = state.count;
  } else if (state.endType === "until" && state.until) {
    options.until = new Date(`${state.until}T23:59:59Z`);
  }

  const rule = new RRule(options);
  return rule.toString().replace(RRULE_PREFIX_RE, "");
}

/** Human-readable label for an RRULE string. */
export function rruleToLabel(rruleString: string): string {
  try {
    const rule = parseRRule(rruleString);
    return rule.toText();
  } catch {
    return "Recurring";
  }
}

// ---------------------------------------------------------------------------
// Series splitting (for "this and following" edits)
// ---------------------------------------------------------------------------

/**
 * Compute the truncated UNTIL date for the original series when splitting
 * at a given date. Returns the RRULE string with UNTIL set to the day before
 * the split date.
 */
export function truncateRRule(rruleString: string, splitDate: string): string {
  const rule = parseRRule(rruleString);
  const opts = { ...rule.origOptions };

  // Set UNTIL to the day before the split
  const split = new Date(`${splitDate}T00:00:00Z`);
  split.setUTCDate(split.getUTCDate() - 1);
  opts.until = split;

  // Remove count if present (UNTIL and COUNT are mutually exclusive)
  opts.count = undefined;

  const truncated = new RRule(opts);
  return truncated.toString().replace(RRULE_PREFIX_RE, "");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date to YYYY-MM-DD string (local time). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format a Date to YYYY-MM-DD string (UTC). Used for RRULE UNTIL dates which are stored in UTC. */
function toISODateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
