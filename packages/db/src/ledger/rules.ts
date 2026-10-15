import { LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";
import type {
  LedgerEffect,
  LedgerMedium,
  MovementDirection,
  MovementKind,
} from "@pi-dash/shared/ledger";
import { isSafePaise } from "@pi-dash/shared/money";

/**
 * Pure rules of the posting engine: what a posting may contain, checked
 * before anything is written. Source handlers (opening balances now, income
 * and expenses in later layers) build a `PostingInput`; the engine checks it
 * here, then resolves periods and writes it.
 */

export type LedgerErrorCode =
  | "before_cutover"
  | "closed_year"
  | "empty"
  | "invalid"
  | "invalid_amount"
  | "invalid_date"
  | "no_period"
  | "not_found"
  | "already_reversed"
  | "transfer_not_zero"
  | "unbalanced";

/** A refusal whose message is safe to show the person posting. */
export class LedgerError extends Error {
  readonly code: LedgerErrorCode;
  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "LedgerError";
  }
}

export interface EntryInput {
  accountHeadId: string;
  amountPaise: number;
  costCentreId?: string | null;
  /** Defaults to the posting's economic date. */
  economicOn?: string;
  effect: LedgerEffect;
  eventId?: string | null;
  fundId: string;
  medium?: LedgerMedium;
  memo?: string | null;
  partyId?: string | null;
  programmeId?: string | null;
  projectId?: string | null;
  sourceLineId?: string | null;
}

export interface MovementInput {
  amountPaise: number;
  bankValueOn?: string | null;
  direction: MovementDirection;
  kind: MovementKind;
  memo?: string | null;
  /** Defaults to the posting's economic date. */
  occurredOn?: string;
  orgAccountId: string;
  paymentReference?: string | null;
  transferId?: string | null;
}

export interface PostingInput {
  action: string;
  economicOn: string;
  entries: readonly EntryInput[];
  movements: readonly MovementInput[];
  sourceId: string;
  sourceRevision?: number;
  sourceType: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function assertDay(value: string, label: string) {
  if (!isIsoDay(value)) {
    throw new LedgerError("invalid_date", `${label} is not a real date`);
  }
  if (value < LEDGER_CUTOVER_ON) {
    throw new LedgerError(
      "before_cutover",
      `Nothing dated before ${LEDGER_CUTOVER_ON} is posted; the audited opening balances already contain it`
    );
  }
}

function assertAmount(amountPaise: number) {
  if (!(isSafePaise(amountPaise) && amountPaise > 0)) {
    throw new LedgerError(
      "invalid_amount",
      "Every amount in the books must be more than zero"
    );
  }
}

/**
 * Transfers between the trust's own accounts: each transfer id's legs net
 * to zero and touch at least two accounts.
 */
export function assertTransfersNetZero(movements: readonly MovementInput[]) {
  const groups = new Map<string, { accounts: Set<string>; net: number }>();
  for (const m of movements) {
    if (m.kind !== "transfer") {
      continue;
    }
    if (!m.transferId) {
      throw new LedgerError(
        "transfer_not_zero",
        "A transfer leg needs the transfer it belongs to"
      );
    }
    const group = groups.get(m.transferId) ?? {
      accounts: new Set<string>(),
      net: 0,
    };
    group.accounts.add(m.orgAccountId);
    group.net += m.direction === "in" ? m.amountPaise : -m.amountPaise;
    groups.set(m.transferId, group);
  }
  for (const group of groups.values()) {
    if (group.net !== 0 || group.accounts.size < 2) {
      throw new LedgerError(
        "transfer_not_zero",
        "A transfer must move the same amount out of one account and into another"
      );
    }
  }
}

/** Every date a posting touches, for period resolution. */
export function postingDates(input: PostingInput): string[] {
  return [
    ...new Set([
      input.economicOn,
      ...input.entries.map((e) => e.economicOn ?? input.economicOn),
      ...input.movements.map((m) => m.occurredOn ?? input.economicOn),
    ]),
  ].sort();
}

/** Checks a posting before it is written; throws a LedgerError. */
export function validatePostingInput(input: PostingInput) {
  if (!(input.sourceType && input.sourceId && input.action)) {
    throw new LedgerError("invalid", "A posting needs its source and action");
  }
  const revision = input.sourceRevision ?? 1;
  if (!(Number.isInteger(revision) && revision >= 1)) {
    throw new LedgerError("invalid", "A source revision starts at 1");
  }
  if (input.entries.length + input.movements.length === 0) {
    throw new LedgerError("empty", "A posting needs at least one line");
  }
  for (const day of postingDates(input)) {
    assertDay(day, "The date");
  }
  for (const e of input.entries) {
    assertAmount(e.amountPaise);
  }
  for (const m of input.movements) {
    assertAmount(m.amountPaise);
    if (m.bankValueOn && !isIsoDay(m.bankValueOn)) {
      throw new LedgerError("invalid_date", "The bank value date is not real");
    }
  }
  assertTransfersNetZero(input.movements);
}
