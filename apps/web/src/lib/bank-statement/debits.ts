import { db } from "@pi-dash/db";
import {
  type DebitDocument,
  type DebitDocumentFilter,
  debitSummary,
  insertAllocations,
  type LiveAllocation,
  listDebitDocuments,
  liveAllocationsOfLines,
  lockDebitDocuments,
  releaseLineAllocations,
  unseenPayments,
} from "@pi-dash/db/queries/bank-debits";
import {
  type StatementLineRecord,
  type StatementTx,
  updateStatementLine,
} from "@pi-dash/db/queries/statement-lines";
import { statementLine } from "@pi-dash/db/schema/statement-line";
import type { StatementLineMatchReason } from "@pi-dash/shared/constants";
import { LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";
import { formatPaise } from "@pi-dash/shared/money";
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { LedgerSourceRef } from "@/lib/ledger-posting";

import {
  DebitAllocationError,
  planDebitAllocation,
  remainingOf,
  suggestDebitMatches,
} from "./debit-match";
import { StatementInputError } from "./errors";
import type {
  DebitDocumentView,
  DebitSuggestionsResponse,
  StatementLineAction,
  UnseenPaymentsResponse,
} from "./types";

/**
 * Server side of bank debit matching (finance layer 3-3b): suggestions,
 * "Find other match", and the match, quick action and unmatch writes,
 * which run inside the caller's statement line transaction (the statement
 * line lock serialises them with every other line write, so two reviewers
 * never pay the same claim twice or explain the same debit twice). The
 * books follow through the posting jobs the caller queues.
 */

const view = (doc: DebitDocument): DebitDocumentView => ({
  allocatedPaise: doc.allocatedPaise,
  amountPaise: doc.amountPaise,
  id: doc.id,
  kind: doc.kind,
  on: doc.on,
  payee: doc.payee,
  reference: doc.reference,
  requestId: doc.requestId,
  title: doc.title,
});

/** The posting sources that read these allocations. */
export function allocationSources(
  lineId: string,
  allocations: readonly Pick<
    LiveAllocation,
    "kind" | "reimbursementId" | "vendorPaymentTransactionId"
  >[]
): LedgerSourceRef[] {
  return allocations.flatMap((a): LedgerSourceRef[] => {
    if (a.reimbursementId) {
      return [{ sourceId: a.reimbursementId, sourceType: "reimbursement" }];
    }
    if (a.vendorPaymentTransactionId) {
      return [
        {
          sourceId: a.vendorPaymentTransactionId,
          sourceType: "vendor_payment_transaction",
        },
      ];
    }
    return [{ sourceId: lineId, sourceType: "statement_charge" }];
  });
}

/** Suggested claims and vendor payments for each open debit of an account. */
export async function debitSuggestions(
  orgAccountId: string
): Promise<DebitSuggestionsResponse> {
  const lines = await db
    .select({
      amountPaise: statementLine.amountPaise,
      dismissed: statementLine.dismissedSuggestions,
      id: statementLine.id,
      narration: statementLine.narration,
      reference: statementLine.reference,
      valueOn: statementLine.valueOn,
    })
    .from(statementLine)
    .where(
      and(
        eq(statementLine.orgAccountId, orgAccountId),
        eq(statementLine.direction, "debit"),
        eq(statementLine.matchStatus, "unmatched")
      )
    );
  const allocated = new Map<string, number>();
  for (const a of await liveAllocationsOfLines(
    db,
    lines.map((l) => l.id)
  )) {
    allocated.set(
      a.statementLineId,
      (allocated.get(a.statementLineId) ?? 0) + a.amountPaise
    );
  }
  // Every open document: a reference match may be dated anywhere.
  const docs =
    lines.length > 0
      ? await listDebitDocuments(db, { limit: 5000 })
      : ([] as DebitDocument[]);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const result: DebitSuggestionsResponse = { lines: {} };
  for (const line of lines) {
    const allocatedPaise = allocated.get(line.id) ?? 0;
    const suggestions = suggestDebitMatches(
      {
        allocatedPaise,
        amountPaise: line.amountPaise,
        dismissed: line.dismissed ?? [],
        id: line.id,
        narration: line.narration,
        reference: line.reference,
        valueOn: line.valueOn,
      },
      docs
    );
    result.lines[line.id] = {
      allocatedPaise,
      suggestions: suggestions.flatMap((s) => {
        const doc = byId.get(s.id);
        return doc ? [{ ...view(doc), reason: s.reason }] : [];
      }),
    };
  }
  return result;
}

/** "Find other match": open claims and vendor payments, filtered. */
export async function searchDebitDocuments(
  filter: DebitDocumentFilter
): Promise<DebitDocumentView[]> {
  return (await listDebitDocuments(db, { ...filter, limit: 100 })).map(view);
}

/** Approved claims and payments from the cutover that no bank debit pays in full. */
export async function listUnseenPayments(): Promise<UnseenPaymentsResponse> {
  return { documents: (await unseenPayments(db)).map(view) };
}

/** The account's bank debit figures, for its reconciliation summary. */
export async function accountDebitSummary(orgAccountId: string) {
  return await debitSummary(db, orgAccountId);
}

// ── Writes (inside the caller's statement line transaction) ─────────────────

/** Money out still unexplained on an open debit. */
async function openPaiseOf(tx: StatementTx, line: StatementLineRecord) {
  const live = await liveAllocationsOfLines(tx, [line.id]);
  return {
    live,
    openPaise:
      line.amountPaise - live.reduce((sum, a) => sum + a.amountPaise, 0),
  };
}

function requireOpenDebit(line: StatementLineRecord) {
  if (line.direction !== "debit") {
    throw new StatementInputError(
      "Only money out can pay a claim or a vendor payment"
    );
  }
  if (line.matchStatus !== "unmatched") {
    throw new StatementInputError(
      "This line is already matched or ignored; unmatch it first"
    );
  }
}

/** Marks the line matched once its allocations explain all of it. */
async function settleLine(
  tx: StatementTx,
  line: StatementLineRecord,
  openPaise: number,
  reason: StatementLineMatchReason,
  actorId: string,
  now: Date
) {
  if (openPaise > 0) {
    await updateStatementLine(tx, line.id, { updatedAt: now });
    return;
  }
  await updateStatementLine(tx, line.id, {
    ignoredReason: null,
    matchedAt: now,
    matchedBy: actorId,
    matchKind: "expense",
    matchReason: reason,
    matchStatus: "matched",
    needsClaimAt: null,
    needsClaimBy: null,
    suggestedContributionId: null,
    suggestedKind: null,
    suggestedSettlementId: null,
    suggestionReason: null,
    updatedAt: now,
  });
}

type MatchDebitAction = Extract<StatementLineAction, { action: "match_debit" }>;

/**
 * Pays claims and vendor payments from a debit: the selection in the
 * order picked, each up to what is left of it, with the difference
 * recorded as declared. Refuses a document that is no longer approved or
 * was voided, or that bank lines already pay in full.
 */
export async function matchDebit(
  tx: StatementTx,
  line: StatementLineRecord,
  input: MatchDebitAction,
  actorId: string,
  now: Date
): Promise<LedgerSourceRef[]> {
  requireOpenDebit(line);
  const { live, openPaise } = await openPaiseOf(tx, line);
  if (openPaise <= 0) {
    throw new StatementInputError("This line is already explained in full");
  }
  if (input.items.length === 0) {
    throw new StatementInputError("Pick at least one claim or payment");
  }
  await lockDebitDocuments(tx, input.items);
  const docs = await listDebitDocuments(tx, {
    ids: input.items.map((i) => i.id),
  });
  const byId = new Map(docs.map((d) => [d.id, d]));
  const selections = input.items.map((item) => {
    const doc = byId.get(item.id);
    if (!doc || doc.kind !== item.kind) {
      throw new StatementInputError(
        "One of the records is no longer approved, or was voided. Refresh and pick again."
      );
    }
    if (
      live.some(
        (a) => (a.reimbursementId ?? a.vendorPaymentTransactionId) === doc.id
      )
    ) {
      throw new StatementInputError(
        `"${doc.title}" is already matched to this line`
      );
    }
    return { id: doc.id, kind: doc.kind, remainingPaise: remainingOf(doc) };
  });
  let plan: ReturnType<typeof planDebitAllocation>;
  try {
    plan = planDebitAllocation(openPaise, selections);
  } catch (error) {
    if (error instanceof DebitAllocationError) {
      throw new StatementInputError(error.message);
    }
    throw error;
  }
  if (!plan.differences.includes(input.difference)) {
    throw new StatementInputError(
      plan.selectedPaise === openPaise
        ? "The amounts changed; refresh and confirm again"
        : `The selection is ${formatPaise(plan.selectedPaise)} against ${formatPaise(openPaise)} in the bank: say how the difference is recorded`
    );
  }
  const rows: Parameters<typeof insertAllocations>[2][number][] =
    plan.allocations.map((a) => ({
      amountPaise: a.amountPaise,
      id: uuidv7(),
      kind: a.kind,
      reimbursementId: a.kind === "reimbursement" ? a.id : null,
      vendorPaymentTransactionId:
        a.kind === "vendor_payment_transaction" ? a.id : null,
    }));
  if (input.difference === "bank_charges" && plan.debitLeftPaise > 0) {
    if (live.some((a) => a.kind === "bank_charges")) {
      throw new StatementInputError(
        "This line already has bank charges; unmatch it to record them again"
      );
    }
    rows.push({
      amountPaise: plan.debitLeftPaise,
      id: uuidv7(),
      kind: "bank_charges",
      reimbursementId: null,
      vendorPaymentTransactionId: null,
    });
  }
  await insertAllocations(tx, line.id, rows, actorId, now);
  const left = openPaise - rows.reduce((sum, r) => sum + r.amountPaise, 0);
  await settleLine(tx, line, left, input.reason ?? "manual", actorId, now);
  return allocationSources(line.id, rows);
}

/**
 * Bank charges or a tax payment: explains what is left of a debit with no
 * document behind it. Posts from the line itself from the cutover; before
 * it, the mark is evidence only.
 */
export async function markDebitCharge(
  tx: StatementTx,
  line: StatementLineRecord,
  kind: "bank_charges" | "tax_payment",
  note: string | null,
  actorId: string,
  now: Date
): Promise<LedgerSourceRef[]> {
  requireOpenDebit(line);
  const { live, openPaise } = await openPaiseOf(tx, line);
  if (openPaise <= 0) {
    throw new StatementInputError("This line is already explained in full");
  }
  if (live.some((a) => a.kind === kind)) {
    throw new StatementInputError(
      "This line already has that mark; unmatch it to record it again"
    );
  }
  const rows = [
    {
      amountPaise: openPaise,
      id: uuidv7(),
      kind,
      reimbursementId: null,
      vendorPaymentTransactionId: null,
    },
  ];
  await insertAllocations(tx, line.id, rows, actorId, now);
  if (note) {
    await updateStatementLine(tx, line.id, { note });
  }
  await settleLine(tx, line, 0, "manual", actorId, now);
  return allocationSources(line.id, rows);
}

/** Flags an open debit as needing a claim, with an optional note on who to chase. */
export async function flagNeedsClaim(
  tx: StatementTx,
  line: StatementLineRecord,
  note: string | null,
  actorId: string,
  now: Date
): Promise<void> {
  requireOpenDebit(line);
  await updateStatementLine(tx, line.id, {
    needsClaimAt: now,
    needsClaimBy: actorId,
    note: note ?? line.note,
    updatedAt: now,
  });
}

export async function clearNeedsClaim(
  tx: StatementTx,
  line: StatementLineRecord,
  now: Date
): Promise<void> {
  if (!line.needsClaimAt) {
    throw new StatementInputError("This line isn't waiting for a claim");
  }
  await updateStatementLine(tx, line.id, {
    needsClaimAt: null,
    needsClaimBy: null,
    updatedAt: now,
  });
}

/**
 * Releases what a debit was matched to (an unmatch): the claims and
 * payments go back to their default payment in the books, and bank
 * charges or taxes on it are reversed. Returns the released allocations.
 */
export async function releaseDebit(
  tx: StatementTx,
  line: StatementLineRecord,
  actorId: string,
  now: Date
): Promise<LiveAllocation[]> {
  return await releaseLineAllocations(tx, line.id, actorId, now);
}

/** True when money out on this line may be set aside: only before the cutover. */
export function debitMayBeIgnored(line: StatementLineRecord): boolean {
  return line.direction !== "debit" || line.valueOn < LEDGER_CUTOVER_ON;
}
