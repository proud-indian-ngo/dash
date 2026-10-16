import {
  auditedDrift,
  type BalanceSheetLine,
  balanceSheetLines,
} from "@pi-dash/shared/audited-figures";
import { LEDGER_ACCOUNT_HEAD_IDS } from "@pi-dash/shared/constants";

import type { AuditedFormLine } from "./audited-figures-form";
import { type Books, type BooksYear, booksAccounts } from "./use-books";

/** Each balance sheet line at the year end, named, in the order the page lists them. */
export function formLines(books: Books, year: BooksYear): AuditedFormLine[] {
  const accounts = booksAccounts(books);
  const accountKinds = new Map(accounts.map((a) => [a.id, a.kind]));
  const lines = balanceSheetLines({
    accountIds: accounts.map((a) => a.id),
    asOf: year.endsOn,
    entries: books.entries,
    fundIds: books.funds.filter((f) => f.active).map((f) => f.id),
    movements: books.movements,
  });
  const label = lineLabeller(books);
  const named = lines.map((l) => ({
    ...l,
    accountKind: l.orgAccountId ? accountKinds.get(l.orgAccountId) : undefined,
    label: label(l),
  }));
  const accountLines = named.filter((l) => l.kind === "account");
  const rest = named
    .filter((l) => l.kind !== "account")
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        a.label.localeCompare(b.label)
    );
  return [...accountLines, ...rest];
}

const KIND_ORDER = ["asset", "liability", "fund"];

export function lineLabeller(books: Books) {
  const accountNames = new Map(books.accounts.map((a) => [a.id, a.name]));
  const headNames = new Map(books.heads.map((h) => [h.id, h.name]));
  const fundNames = new Map(books.funds.map((f) => [f.id, f.name]));
  return (
    l: Pick<
      BalanceSheetLine,
      "accountHeadId" | "fundId" | "kind" | "memo" | "orgAccountId"
    >
  ) => {
    if (l.kind === "account") {
      return accountNames.get(l.orgAccountId ?? "") ?? "Account";
    }
    if (l.kind === "fund") {
      return fundNames.get(l.fundId ?? "") ?? "Fund";
    }
    const head = headNames.get(l.accountHeadId ?? "") ?? "Account head";
    if (l.memo) {
      return l.memo;
    }
    return l.kind === "asset" &&
      l.accountHeadId === LEDGER_ACCOUNT_HEAD_IDS.fixedAssets
      ? `${head} — other`
      : head;
  };
}

/**
 * How many lines of a year's matched audited figures the books no longer
 * equal (0 when none stand, or they agree).
 */
export function auditedDriftCount(books: Books, year: BooksYear): number {
  const document = books.auditedFigures.find(
    (d) => d.fiscalYearId === year.id && !d.reversedAt && d.status === "matched"
  );
  if (!document) {
    return 0;
  }
  return auditedDrift(
    document.lines
      .filter((l) => l.kind !== "fund_transfer")
      .map((l) => ({ auditedPaise: l.auditedPaise, key: l.lineKey })),
    formLines(books, year)
  ).length;
}
