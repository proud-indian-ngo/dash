const UNTIL_PARSE_RE = /UNTIL=(\d{8})T(\d{6})Z/;

/**
 * Parse the `UNTIL=YYYYMMDDTHHMMSSZ` token from an RRULE string.
 * Returns epoch milliseconds if a well-formed UNTIL is present, else null.
 */
export function parseRuleUntil(rruleStr: string): number | null {
  const m = UNTIL_PARSE_RE.exec(rruleStr);
  const d = m?.[1];
  const t = m?.[2];
  if (!(d && t)) {
    return null;
  }
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}
