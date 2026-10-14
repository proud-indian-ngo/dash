import type {
  StatementLineDirection,
  StatementLineMatchKind,
  StatementLineMatchReason,
} from "@pi-dash/shared/constants";

import { isGiveIndiaNarration } from "./fields";

/**
 * Matching rules for credit lines (pure, server-side). Exact evidence
 * matches automatically; everything else is only suggested for a reviewer:
 *
 * 1. Razorpay settlement: its UTR in the line's reference or narration and
 *    the same amount (the net paid out) → match. Its UTR with another
 *    amount, or the same amount within ±3 days → suggestion.
 * 2. A contribution recorded as deposited into this account (UPI, NEFT,
 *    cheque, cash): same amount, received within ±3 days, and the same
 *    reference when both have one. Equal references → match; one missing →
 *    suggestion; different references → no candidate.
 * 3. A narration naming GiveIndia or give.do → suggestion of a give.do payout.
 *
 * Each settlement and contribution goes to one line at most. Debit lines are
 * never matched here: expense matching comes with the ledger.
 */

export const MATCH_WINDOW_DAYS = 3;

export interface LineToMatch {
  amountPaise: number;
  direction: StatementLineDirection;
  /** Suggestions a reviewer turned down: target IDs or "giveindia_payout". */
  dismissed: readonly string[];
  id: string;
  narration: string;
  reference: string | null;
  valueOn: string;
}

export interface SettlementCandidate {
  amountPaise: number;
  id: string;
  settledOn: string;
  utr: string | null;
}

export interface ContributionCandidate {
  amountPaise: number;
  id: string;
  receivedOn: string;
  reference: string | null;
}

export interface MatchTarget {
  kind: Extract<
    StatementLineMatchKind,
    "contribution" | "giveindia_payout" | "settlement"
  >;
  reason: StatementLineMatchReason;
  /** Null for a give.do payout. */
  targetId: string | null;
}

export type LinePlan =
  | { kind: "match"; target: MatchTarget }
  | { kind: "suggest"; target: MatchTarget }
  | { kind: "none" };

export const GIVEINDIA_DISMISS_KEY = "giveindia_payout";

/** Upper-case letters and digits only, so "UTR: axis-123" and "AXIS123" compare. */
export const normalizeRef = (value: string | null | undefined) =>
  (value ?? "").toUpperCase().replaceAll(/[^A-Z0-9]/g, "");

/** A reference for equality: cheque numbers lose leading zeros. */
const comparableRef = (ref: string) =>
  /^\d+$/.test(ref) ? ref.replace(/^0+(?=\d)/, "") : ref;

/**
 * Strong enough to match on: at least four characters, with a digit, and
 * not all zeros. Words such as "NEFT" or "UPI" never pair two payments.
 */
const usableRef = (ref: string) =>
  ref.length >= 4 && /\d/.test(ref) && !/^0+$/.test(ref);

/**
 * The comparable forms of a reference: the whole value with punctuation
 * removed, and each of its alphanumeric tokens ("UPI/412345678901/ASHA"
 * gives "412345678901"); only usable ones.
 */
function referenceForms(value: string | null | undefined): Set<string> {
  const text = (value ?? "").toUpperCase();
  const forms = [normalizeRef(text), ...text.split(/[^A-Z0-9]+/)];
  return new Set(forms.filter(usableRef).map(comparableRef));
}

/** Whether two references name the same payment, by whole tokens. */
export function sameReference(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const right = referenceForms(b);
  return [...referenceForms(a)].some((form) => right.has(form));
}

/** Whether the line carries this UTR as a whole token of its reference or narration. */
export function lineHasUtr(
  line: Pick<LineToMatch, "narration" | "reference">,
  utr: string | null
): boolean {
  const wanted = normalizeRef(utr);
  if (!usableRef(wanted)) {
    return false;
  }
  const wantedForm = comparableRef(wanted);
  return (
    referenceForms(line.reference).has(wantedForm) ||
    referenceForms(line.narration).has(wantedForm)
  );
}

const DAY_MS = 86_400_000;

/** Whole days between two yyyy-MM-dd dates, unsigned. */
export function daysApart(a: string, b: string): number {
  return Math.round(
    Math.abs(
      new Date(`${a}T00:00:00Z`).getTime() -
        new Date(`${b}T00:00:00Z`).getTime()
    ) / DAY_MS
  );
}

const withinWindow = (a: string, b: string) =>
  daysApart(a, b) <= MATCH_WINDOW_DAYS;

/** Closest date first, then the earlier ID, so the plan is deterministic. */
function closest<T extends { id: string }>(
  candidates: readonly T[],
  dateOf: (candidate: T) => string,
  valueOn: string
): T | undefined {
  return [...candidates].sort(
    (a, b) =>
      daysApart(dateOf(a), valueOn) - daysApart(dateOf(b), valueOn) ||
      a.id.localeCompare(b.id)
  )[0];
}

export interface MatchPlanInput {
  contributions: readonly ContributionCandidate[];
  lines: readonly LineToMatch[];
  settlements: readonly SettlementCandidate[];
}

/** A plan for every line: match, suggest or nothing. */
export function planStatementMatches(
  input: MatchPlanInput
): Map<string, LinePlan> {
  const plans = new Map<string, LinePlan>();
  const used = new Set<string>();
  const credits = [...input.lines]
    .filter((line) => line.direction === "credit")
    .sort(
      (a, b) => a.valueOn.localeCompare(b.valueOn) || a.id.localeCompare(b.id)
    );
  for (const line of input.lines) {
    plans.set(line.id, { kind: "none" });
  }

  // Pass 1: exact evidence, before any suggestion can take a target.
  for (const line of credits) {
    // A record the reviewer turned down or unmatched never comes back.
    const free = (id: string) => !(used.has(id) || line.dismissed.includes(id));
    const settlement = input.settlements.find(
      (s) =>
        free(s.id) &&
        s.amountPaise === line.amountPaise &&
        lineHasUtr(line, s.utr)
    );
    if (settlement) {
      used.add(settlement.id);
      plans.set(line.id, {
        kind: "match",
        target: { kind: "settlement", reason: "utr", targetId: settlement.id },
      });
      continue;
    }
    const contribution = input.contributions.find(
      (c) =>
        free(c.id) &&
        c.amountPaise === line.amountPaise &&
        withinWindow(c.receivedOn, line.valueOn) &&
        sameReference(c.reference, line.reference)
    );
    if (contribution) {
      used.add(contribution.id);
      plans.set(line.id, {
        kind: "match",
        target: {
          kind: "contribution",
          reason: "reference",
          targetId: contribution.id,
        },
      });
    }
  }

  // Pass 2: suggestions for the lines still open.
  for (const line of credits) {
    if (plans.get(line.id)?.kind === "match") {
      continue;
    }
    const open = (id: string) => !(used.has(id) || line.dismissed.includes(id));
    const suggest = (target: MatchTarget) => {
      if (target.targetId) {
        used.add(target.targetId);
      }
      plans.set(line.id, { kind: "suggest", target });
    };

    const byUtr = input.settlements.find(
      (s) => open(s.id) && lineHasUtr(line, s.utr)
    );
    if (byUtr) {
      suggest({ kind: "settlement", reason: "utr", targetId: byUtr.id });
      continue;
    }
    const settlement = closest(
      input.settlements.filter(
        (s) =>
          open(s.id) &&
          s.amountPaise === line.amountPaise &&
          withinWindow(s.settledOn, line.valueOn)
      ),
      (s) => s.settledOn,
      line.valueOn
    );
    if (settlement) {
      suggest({
        kind: "settlement",
        reason: "amount_date",
        targetId: settlement.id,
      });
      continue;
    }
    const contribution = closest(
      input.contributions.filter(
        (c) =>
          open(c.id) &&
          c.amountPaise === line.amountPaise &&
          withinWindow(c.receivedOn, line.valueOn) &&
          // Different references mean different payments.
          !(
            referenceForms(c.reference).size > 0 &&
            referenceForms(line.reference).size > 0 &&
            !sameReference(c.reference, line.reference)
          )
      ),
      (c) => c.receivedOn,
      line.valueOn
    );
    if (contribution) {
      suggest({
        kind: "contribution",
        reason: "amount_date",
        targetId: contribution.id,
      });
      continue;
    }
    if (
      isGiveIndiaNarration(line.narration) &&
      !line.dismissed.includes(GIVEINDIA_DISMISS_KEY)
    ) {
      suggest({
        kind: "giveindia_payout",
        reason: "giveindia_narration",
        targetId: null,
      });
    }
  }
  return plans;
}

/** The date range candidates must fall in for these lines. */
export function candidateWindow(
  lines: readonly Pick<LineToMatch, "valueOn">[]
): { from: string; to: string } | null {
  const dates = lines.map((line) => line.valueOn).sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (!(first && last)) {
    return null;
  }
  const shift = (iso: string, days: number) => {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  return {
    from: shift(first, -MATCH_WINDOW_DAYS),
    to: shift(last, MATCH_WINDOW_DAYS),
  };
}
