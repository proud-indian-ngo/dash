import { epochDayToIso, todayInKolkata } from "@pi-dash/shared/income";
import {
  type BookEntry,
  type BookHeadType,
  type BookMovement,
  LEDGER_CUTOVER_ON,
  type LedgerEffect,
  type MovementDirection,
  type MovementKind,
} from "@pi-dash/shared/ledger";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

/** A fiscal year as the books pages use it, dates as yyyy-MM-dd. */
export interface BooksYear {
  closedAt: number | null;
  endsOn: string;
  id: string;
  label: string;
  startsOn: string;
}

export interface BooksMovementRow extends BookMovement {
  kind: MovementKind;
  memo: string | null;
  paymentReference: string | null;
  postingId: string;
  reversal: boolean;
}

export interface BooksEntryRow extends BookEntry {
  memo: string | null;
  postingId: string;
  reversal: boolean;
}

export interface BooksPosting {
  action: string;
  id: string;
  reason: string | null;
  sourceId: string;
  sourceType: string;
}

/**
 * Everything the books pages read, from Zero, with dates as yyyy-MM-dd.
 * Years before the cutover are left out: nothing is ever posted into them.
 */
export function useBooks() {
  const [yearRows, yearsResult] = useQuery(queries.fiscalYear.all());
  const [accounts, accountsResult] = useQuery(queries.orgAccount.all());
  const [heads, headsResult] = useQuery(queries.accountHead.all());
  const [funds, fundsResult] = useQuery(queries.fund.all());
  const [programmes] = useQuery(queries.programme.all());
  const [movementRows, movementsResult] = useQuery(queries.ledger.movements());
  const [entryRows, entriesResult] = useQuery(queries.ledger.entries());
  const [postingRows] = useQuery(queries.ledger.postings());
  const [openingBalances, openingResult] = useQuery(
    queries.ledger.openingBalances()
  );

  const years: BooksYear[] = yearRows
    .map((y) => ({
      closedAt: y.closedAt ?? null,
      endsOn: epochDayToIso(y.endsOn),
      id: y.id,
      label: y.label,
      startsOn: epochDayToIso(y.startsOn),
    }))
    .filter((y) => y.endsOn >= LEDGER_CUTOVER_ON)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));

  const headType = new Map(heads.map((h) => [h.id, h.type as BookHeadType]));
  const movements: BooksMovementRow[] = movementRows.map((m) => ({
    amountPaise: m.amountPaise,
    direction: m.direction as MovementDirection,
    id: m.id,
    kind: m.kind as MovementKind,
    memo: m.memo ?? null,
    occurredOn: epochDayToIso(m.occurredOn),
    orgAccountId: m.orgAccountId,
    paymentReference: m.paymentReference ?? null,
    postingId: m.postingId,
    reversal: Boolean(m.reversesMovementId),
  }));
  // An entry whose head hasn't synced yet is left out rather than guessed.
  const entries: BooksEntryRow[] = entryRows.flatMap((e) => {
    const type = headType.get(e.accountHeadId);
    return type ? [{ ...toEntry(e), headType: type }] : [];
  });
  function toEntry(e: (typeof entryRows)[number]) {
    return {
      accountHeadId: e.accountHeadId,
      amountPaise: e.amountPaise,
      economicOn: epochDayToIso(e.economicOn),
      effect: e.effect as LedgerEffect,
      fundId: e.fundId,
      id: e.id,
      memo: e.memo ?? null,
      postingId: e.postingId,
      programmeId: e.programmeId ?? null,
      reversal: Boolean(e.reversesEntryId),
    };
  }
  const postings = new Map<string, BooksPosting>(
    postingRows.map((p) => [
      p.id,
      {
        action: p.action,
        id: p.id,
        reason: p.reason ?? null,
        sourceId: p.sourceId,
        sourceType: p.sourceType,
      },
    ])
  );

  return {
    accounts,
    entries,
    funds,
    heads,
    // Balances need every head, account and fund before they mean anything.
    isLoading:
      (heads.length === 0 && headsResult.type !== "complete") ||
      (accounts.length === 0 && accountsResult.type !== "complete") ||
      (funds.length === 0 && fundsResult.type !== "complete") ||
      (yearRows.length === 0 && yearsResult.type !== "complete") ||
      (movementRows.length === 0 && movementsResult.type !== "complete") ||
      (entryRows.length === 0 && entriesResult.type !== "complete") ||
      (openingBalances.length === 0 && openingResult.type !== "complete"),
    movements,
    openingBalances,
    postings,
    programmes,
    today: todayInKolkata(),
    years,
  };
}

export type Books = ReturnType<typeof useBooks>;

/** The year containing today, else the latest year. */
export function defaultYear(
  years: readonly BooksYear[],
  today: string
): BooksYear | undefined {
  return (
    years.find((y) => y.startsOn <= today && today <= y.endsOn) ?? years[0]
  );
}

/** Accounts the books list: every non-cash account, and cash only once it has moved. */
export function booksAccounts(books: Pick<Books, "accounts" | "movements">) {
  const moved = new Set(books.movements.map((m) => m.orgAccountId));
  return books.accounts
    .filter((a) => (a.kind !== "cash" && a.active) || moved.has(a.id))
    .sort(
      (a, b) =>
        ACCOUNT_KIND_ORDER.indexOf(a.kind) -
          ACCOUNT_KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name)
    );
}

const ACCOUNT_KIND_ORDER: readonly string[] = [
  "bank",
  "deposit",
  "gateway_clearing",
  "cash",
];

export const ACCOUNT_KIND_LABELS: Record<string, string> = {
  bank: "Bank",
  cash: "Cash",
  deposit: "Fixed deposit",
  gateway_clearing: "Clearing",
};
