import type { OrgAccountKind } from "@pi-dash/shared/constants";
import {
  type BookHeadType,
  LEDGER_CUTOVER_ON,
  type LedgerEffect,
  type LedgerMedium,
  type MovementDirection,
  type MovementKind,
} from "@pi-dash/shared/ledger";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  min,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "..";
import {
  accountHead,
  costCentre,
  fiscalYear,
  fund,
  orgAccount,
  programme,
  project,
} from "../schema/finance-dimensions";
import {
  accountMovement,
  ledgerEntry,
  openingBalance,
  posting,
} from "../schema/ledger";
import { party } from "../schema/party";
import { statementLine } from "../schema/statement-line";
import { teamEvent } from "../schema/team-event";

/**
 * Server only. What the CA handoff workbook (finance-ledger-cutover.md
 * section 5) is built from: the year's movements and entries as posted
 * (reversals included), everything before the year summed in SQL into
 * brought-forward rows, the names of every dimension, the accounts, each
 * account's last bank statement balance and which movements a bank
 * statement line backs. Read-only; party names are the only personal data.
 * Callers run it inside one read-only repeatable-read transaction
 * (`readWorkbookSnapshot`), so every sheet sees the same books.
 */

/** The workbook refuses a year with more than this many movements plus entries. */
export const CA_WORKBOOK_MAX_ROWS = 100_000;

/** Source type of the rows that carry everything before the year, summed. */
export const BROUGHT_FORWARD_SOURCE = "brought_forward";

type Database = typeof db;
/** The app database or a transaction on it. */
export type WorkbookReader = Pick<
  Database,
  "execute" | "select" | "selectDistinctOn"
>;

export interface WorkbookYear {
  closed: boolean;
  endsOn: string;
  id: string;
  label: string;
  startsOn: string;
}

export interface WorkbookAccount {
  id: string;
  kind: OrgAccountKind;
  name: string;
}

export interface WorkbookMovement {
  amountPaise: number;
  direction: MovementDirection;
  id: string;
  kind: MovementKind;
  memo: string | null;
  occurredOn: string;
  orgAccountId: string;
  paymentReference: string | null;
  postedOn: string;
  reversesMovementId: string | null;
  sourceId: string;
  sourceType: string;
  transferId: string | null;
}

export interface WorkbookEntry {
  accountHeadId: string;
  amountPaise: number;
  costCentreName: string | null;
  economicOn: string;
  effect: LedgerEffect;
  eventName: string | null;
  fundId: string;
  fundName: string;
  headName: string;
  headType: BookHeadType;
  id: string;
  medium: LedgerMedium;
  memo: string | null;
  partyName: string | null;
  postedOn: string;
  programmeId: string | null;
  programmeName: string | null;
  projectName: string | null;
  reversesEntryId: string | null;
  sourceId: string;
  sourceType: string;
}

export interface WorkbookStatementBalance {
  balancePaise: number;
  valueOn: string;
}

export interface WorkbookFacts {
  accounts: WorkbookAccount[];
  /**
   * The year's entries, after one brought-forward row per head, fund, memo
   * (opening lines only) and effect summing everything before the year.
   */
  entries: WorkbookEntry[];
  /**
   * The day the ledger went live: when the cutover year's first opening
   * balances were posted. Null until they are.
   */
  goLiveOn: string | null;
  /** Bank statement balances at or before the year end, by account. */
  lastStatementBalances: Map<string, WorkbookStatementBalance>;
  /** The year's movements, after one brought-forward row per account. */
  movements: WorkbookMovement[];
  /** `${orgAccountId}:${sourceId}` for every movement a matched bank line backs. */
  statementBacked: Set<string>;
  year: WorkbookYear;
}

/** A refusal written for the person exporting. */
export class CaWorkbookRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaWorkbookRefusal";
  }
}

/**
 * Runs `work` in one read-only, repeatable-read transaction: a consistent
 * snapshot of the books for the whole workbook.
 */
export function readWorkbookSnapshot<T>(
  work: (reader: WorkbookReader) => Promise<T>
): Promise<T> {
  return db.transaction((tx) => work(tx), {
    accessMode: "read only",
    isolationLevel: "repeatable read",
  });
}

export async function loadWorkbookYear(
  reader: WorkbookReader,
  fiscalYearId: string
): Promise<WorkbookYear | null> {
  const [row] = await reader
    .select({
      closedAt: fiscalYear.closedAt,
      endsOn: fiscalYear.endsOn,
      id: fiscalYear.id,
      label: fiscalYear.label,
      startsOn: fiscalYear.startsOn,
    })
    .from(fiscalYear)
    .where(eq(fiscalYear.id, fiscalYearId))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    closed: row.closedAt !== null,
    endsOn: row.endsOn,
    id: row.id,
    label: row.label,
    startsOn: row.startsOn,
  };
}

/** Whether the cutover year's opening balances stand (posted, not reversed). */
export async function openingBalancesPosted(
  reader: WorkbookReader
): Promise<boolean> {
  const [row] = await reader
    .select({ id: openingBalance.id })
    .from(openingBalance)
    .innerJoin(fiscalYear, eq(fiscalYear.id, openingBalance.fiscalYearId))
    .where(
      and(
        eq(fiscalYear.startsOn, LEDGER_CUTOVER_ON),
        isNull(openingBalance.reversalPostingId)
      )
    )
    .limit(1);
  return row !== undefined;
}

/** The posting day of the cutover year's first opening balances, reversed or not. */
async function loadGoLiveOn(reader: WorkbookReader): Promise<string | null> {
  const [row] = await reader
    .select({ on: min(posting.postedOn) })
    .from(openingBalance)
    .innerJoin(fiscalYear, eq(fiscalYear.id, openingBalance.fiscalYearId))
    .innerJoin(posting, eq(posting.id, openingBalance.postingId))
    .where(eq(fiscalYear.startsOn, LEDGER_CUTOVER_ON));
  return row?.on ?? null;
}

const partyName = sql<
  string | null
>`nullif(trim(coalesce(nullif(trim(${party.legalName}), ''), ${party.displayName})), '')`;

/** The day before an ISO date. */
function dayBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The books for one year. Refuses (CaWorkbookRefusal) a year whose own
 * movements and entries exceed the row bound; earlier years count as one
 * summed row per account or item.
 */
export async function loadWorkbookFacts(
  reader: WorkbookReader,
  year: WorkbookYear
): Promise<WorkbookFacts> {
  const [movementCount] = await reader
    .select({ total: count() })
    .from(accountMovement)
    .where(
      and(
        gte(accountMovement.occurredOn, year.startsOn),
        lte(accountMovement.occurredOn, year.endsOn)
      )
    );
  const [entryCount] = await reader
    .select({ total: count() })
    .from(ledgerEntry)
    .where(
      and(
        gte(ledgerEntry.economicOn, year.startsOn),
        lte(ledgerEntry.economicOn, year.endsOn)
      )
    );
  if (
    (movementCount?.total ?? 0) + (entryCount?.total ?? 0) >
    CA_WORKBOOK_MAX_ROWS
  ) {
    throw new CaWorkbookRefusal(
      "The books are too large for one workbook. Ask for help exporting this year."
    );
  }

  const accounts = await reader
    .select({ id: orgAccount.id, kind: orgAccount.kind, name: orgAccount.name })
    .from(orgAccount)
    .orderBy(asc(orgAccount.createdAt), asc(orgAccount.id));

  const broughtForwardOn = dayBefore(year.startsOn);
  const movements = [
    ...(await priorMovements(reader, year.startsOn, broughtForwardOn)),
    ...(await yearMovements(reader, year)),
  ];
  const entries = [
    ...(await priorEntries(reader, year.startsOn, broughtForwardOn)),
    ...(await yearEntries(reader, year)),
  ];

  return {
    accounts: accounts.map((a) => ({ ...a, kind: a.kind as OrgAccountKind })),
    entries,
    goLiveOn: await loadGoLiveOn(reader),
    lastStatementBalances: await loadLastStatementBalances(reader, year.endsOn),
    movements,
    statementBacked: await loadStatementBacked(reader, movements),
    year,
  };
}

async function yearMovements(
  reader: WorkbookReader,
  year: WorkbookYear
): Promise<WorkbookMovement[]> {
  return await reader
    .select({
      amountPaise: accountMovement.amountPaise,
      direction: accountMovement.direction,
      id: accountMovement.id,
      kind: accountMovement.kind,
      memo: accountMovement.memo,
      occurredOn: accountMovement.occurredOn,
      orgAccountId: accountMovement.orgAccountId,
      paymentReference: accountMovement.paymentReference,
      postedOn: accountMovement.postedOn,
      reversesMovementId: accountMovement.reversesMovementId,
      sourceId: posting.sourceId,
      sourceType: posting.sourceType,
      transferId: accountMovement.transferId,
    })
    .from(accountMovement)
    .innerJoin(posting, eq(posting.id, accountMovement.postingId))
    .where(
      and(
        gte(accountMovement.occurredOn, year.startsOn),
        lte(accountMovement.occurredOn, year.endsOn)
      )
    )
    .orderBy(asc(accountMovement.occurredOn), asc(accountMovement.id));
}

/** Each account's balance before the year, as one movement dated the day before. */
async function priorMovements(
  reader: WorkbookReader,
  startsOn: string,
  on: string
): Promise<WorkbookMovement[]> {
  const rows = await reader
    .select({
      orgAccountId: accountMovement.orgAccountId,
      paise: sql<string>`sum(case when ${accountMovement.direction} = 'in' then ${accountMovement.amountPaise} else -${accountMovement.amountPaise} end)`,
    })
    .from(accountMovement)
    .where(lt(accountMovement.occurredOn, startsOn))
    .groupBy(accountMovement.orgAccountId);
  return rows
    .map((row) => ({
      orgAccountId: row.orgAccountId,
      paise: Number(row.paise),
    }))
    .filter((row) => row.paise !== 0)
    .map((row): WorkbookMovement => ({
      amountPaise: Math.abs(row.paise),
      direction: row.paise > 0 ? "in" : "out",
      id: `bf-${row.orgAccountId}`,
      kind: "opening",
      memo: null,
      occurredOn: on,
      orgAccountId: row.orgAccountId,
      paymentReference: null,
      postedOn: on,
      reversesMovementId: null,
      sourceId: row.orgAccountId,
      sourceType: BROUGHT_FORWARD_SOURCE,
      transferId: null,
    }));
}

async function yearEntries(
  reader: WorkbookReader,
  year: WorkbookYear
): Promise<WorkbookEntry[]> {
  const rows = await reader
    .select({
      accountHeadId: ledgerEntry.accountHeadId,
      amountPaise: ledgerEntry.amountPaise,
      costCentreName: costCentre.name,
      economicOn: ledgerEntry.economicOn,
      effect: ledgerEntry.effect,
      eventName: teamEvent.name,
      fundId: ledgerEntry.fundId,
      fundName: fund.name,
      headName: accountHead.name,
      headType: accountHead.type,
      id: ledgerEntry.id,
      medium: ledgerEntry.medium,
      memo: ledgerEntry.memo,
      partyName,
      postedOn: ledgerEntry.postedOn,
      programmeId: ledgerEntry.programmeId,
      programmeName: programme.name,
      projectName: project.name,
      reversesEntryId: ledgerEntry.reversesEntryId,
      sourceId: posting.sourceId,
      sourceType: posting.sourceType,
    })
    .from(ledgerEntry)
    .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
    .innerJoin(accountHead, eq(accountHead.id, ledgerEntry.accountHeadId))
    .innerJoin(fund, eq(fund.id, ledgerEntry.fundId))
    .leftJoin(programme, eq(programme.id, ledgerEntry.programmeId))
    .leftJoin(project, eq(project.id, ledgerEntry.projectId))
    .leftJoin(teamEvent, eq(teamEvent.id, ledgerEntry.eventId))
    .leftJoin(costCentre, eq(costCentre.id, ledgerEntry.costCentreId))
    .leftJoin(party, eq(party.id, ledgerEntry.partyId))
    .where(
      and(
        gte(ledgerEntry.economicOn, year.startsOn),
        lte(ledgerEntry.economicOn, year.endsOn)
      )
    )
    .orderBy(asc(ledgerEntry.economicOn), asc(ledgerEntry.id));
  return rows.map((e) => ({ ...e, headType: e.headType as BookHeadType }));
}

/**
 * Everything recognised before the year, summed per head, fund and effect;
 * opening lines (the cutover's opening balances) keep their memo and stay
 * apart, so each fixed asset is still its own item.
 */
async function priorEntries(
  reader: WorkbookReader,
  startsOn: string,
  on: string
): Promise<WorkbookEntry[]> {
  const isOpening = sql<boolean>`(${posting.sourceType} = 'opening_balance')`;
  const memo = sql<
    string | null
  >`(case when ${posting.sourceType} = 'opening_balance' then ${ledgerEntry.memo} end)`;
  const rows = await reader
    .select({
      accountHeadId: ledgerEntry.accountHeadId,
      effect: ledgerEntry.effect,
      fundId: ledgerEntry.fundId,
      fundName: fund.name,
      headName: accountHead.name,
      headType: accountHead.type,
      isOpening,
      memo,
      paise: sql<string>`sum(${ledgerEntry.amountPaise})`,
    })
    .from(ledgerEntry)
    .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
    .innerJoin(accountHead, eq(accountHead.id, ledgerEntry.accountHeadId))
    .innerJoin(fund, eq(fund.id, ledgerEntry.fundId))
    .where(lt(ledgerEntry.economicOn, startsOn))
    .groupBy(
      ledgerEntry.accountHeadId,
      ledgerEntry.effect,
      ledgerEntry.fundId,
      fund.name,
      accountHead.name,
      accountHead.type,
      isOpening,
      memo
    );
  return rows.map((row, index): WorkbookEntry => ({
    accountHeadId: row.accountHeadId,
    amountPaise: Number(row.paise),
    costCentreName: null,
    economicOn: on,
    effect: row.effect,
    eventName: null,
    fundId: row.fundId,
    fundName: row.fundName,
    headName: row.headName,
    headType: row.headType as BookHeadType,
    id: `bf-${index}`,
    medium: "monetary",
    memo: row.memo,
    partyName: null,
    postedOn: on,
    programmeId: null,
    programmeName: null,
    projectName: null,
    reversesEntryId: null,
    sourceId: `bf-${index}`,
    sourceType: row.isOpening ? "opening_balance" : BROUGHT_FORWARD_SOURCE,
  }));
}

/** Each account's last statement line with a balance on or before `endsOn`. */
async function loadLastStatementBalances(
  reader: WorkbookReader,
  endsOn: string
): Promise<Map<string, WorkbookStatementBalance>> {
  const rows = await reader
    .selectDistinctOn([statementLine.orgAccountId], {
      balancePaise: statementLine.balancePaise,
      orgAccountId: statementLine.orgAccountId,
      valueOn: statementLine.valueOn,
    })
    .from(statementLine)
    .where(
      and(
        lte(statementLine.valueOn, endsOn),
        isNotNull(statementLine.balancePaise)
      )
    )
    .orderBy(
      statementLine.orgAccountId,
      desc(statementLine.valueOn),
      desc(statementLine.position),
      desc(statementLine.id)
    );
  const balances = new Map<string, WorkbookStatementBalance>();
  for (const row of rows) {
    if (row.balancePaise !== null) {
      balances.set(row.orgAccountId, {
        balancePaise: row.balancePaise,
        valueOn: row.valueOn,
      });
    }
  }
  return balances;
}

const counterpart = alias(statementLine, "counterpart_line");

/**
 * Which (account, source) pairs a matched bank statement line backs: a gift
 * or a payout matched to its line, a line marked as a transfer (the line is
 * the source) and, for a transfer between two bank accounts, the other
 * account's own line paired with it (`transfer_pair_line_id`), so both legs
 * count whichever side posted.
 * Other income has no statement link yet, so its deposits are never backed.
 */
async function loadStatementBacked(
  reader: WorkbookReader,
  movements: readonly WorkbookMovement[]
): Promise<Set<string>> {
  const sourceIds = [
    ...new Set(
      movements
        .filter((m) => m.sourceType !== BROUGHT_FORWARD_SOURCE)
        .map((m) => m.sourceId)
    ),
  ];
  const backed = new Set<string>();
  const chunk = 5000;
  for (let i = 0; i < sourceIds.length; i += chunk) {
    const ids = sourceIds.slice(i, i + chunk);
    const rows = await reader
      .select({
        counterpartAccountId: counterpart.orgAccountId,
        id: statementLine.id,
        matchedContributionId: statementLine.matchedContributionId,
        matchedSettlementId: statementLine.matchedSettlementId,
        orgAccountId: statementLine.orgAccountId,
      })
      .from(statementLine)
      .leftJoin(
        counterpart,
        eq(counterpart.id, statementLine.transferPairLineId)
      )
      .where(
        and(
          eq(statementLine.matchStatus, "matched"),
          sql`(${inArray(statementLine.matchedContributionId, ids)}
            or ${inArray(statementLine.matchedSettlementId, ids)}
            or ${inArray(statementLine.id, ids)})`
        )
      );
    for (const row of rows) {
      const source =
        row.matchedContributionId ?? row.matchedSettlementId ?? row.id;
      backed.add(`${row.orgAccountId}:${source}`);
      if (row.counterpartAccountId) {
        backed.add(`${row.counterpartAccountId}:${source}`);
      }
    }
  }
  return backed;
}
