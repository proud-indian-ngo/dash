import type {
  StatementAllocationKind,
  StatementDocumentAllocationKind,
} from "@pi-dash/shared/constants";
import { LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "..";
import { reimbursement } from "../schema/reimbursement";
import { statementAllocation, statementLine } from "../schema/statement-line";
import { vendorPaymentTransaction } from "../schema/vendor-payment-transaction";
import { STATEMENT_LINE_LOCK, type StatementTx } from "./statement-lines";

/**
 * Database access for bank debit matching (finance layer 3-3b): the
 * approved reimbursements and vendor payments a debit can pay, the live
 * allocations of a line or a document, and the allocation writes. Every
 * write runs inside `withStatementTransaction` (the statement line lock),
 * so two reviewers never allocate the same line or claim at once.
 */

type Reader = Pick<typeof db, "execute">;

/** Vendor payment request statuses whose approved payments are real money out. */
export const PAYABLE_REQUEST_STATUSES = [
  "approved",
  "partially_paid",
  "paid",
  "invoice_pending",
  "completed",
] as const;

/** A claim or vendor payment a bank debit can pay. */
export interface DebitDocument {
  /** Paid by live allocations on bank lines so far. */
  allocatedPaise: number;
  /** The claim's total (its line items) or the payment's amount. */
  amountPaise: number;
  id: string;
  kind: StatementDocumentAllocationKind;
  /** The approval day of a claim, the payment date of a vendor payment (India). */
  on: string;
  /** The claimant's or vendor's name. */
  payee: string;
  /** A vendor payment's UTR or reference; null for claims. */
  reference: string | null;
  /** The reimbursement, or the vendor payment request the payment belongs to. */
  requestId: string;
  title: string;
}

export interface DebitDocumentFilter {
  /** Only these documents (by ID), whatever else is set. */
  ids?: readonly string[];
  kind?: StatementDocumentAllocationKind | null;
  /** Remaining amount at least / at most, in paise. */
  maxPaise?: number | null;
  minPaise?: number | null;
  /** Dated on or after / before (yyyy-MM-dd). */
  from?: string | null;
  to?: string | null;
  /** Free text over the title and the payee. */
  query?: string | null;
  /** Include documents already paid in full by bank lines. */
  includeSettled?: boolean;
  limit?: number;
}

const indiaDay = (column: string) =>
  `((${column} at time zone 'UTC') at time zone 'Asia/Kolkata')::date`;

/**
 * The documents a debit can pay: approved, not voided reimbursements, and
 * approved, not voided payments of a payable vendor payment request, with
 * what bank lines already pay of each. Newest first.
 */
export async function listDebitDocuments(
  reader: Reader,
  filter: DebitDocumentFilter = {}
): Promise<DebitDocument[]> {
  const payable = sql.join(
    PAYABLE_REQUEST_STATUSES.map((s) => sql`${s}`),
    sql`, `
  );
  const conditions: ReturnType<typeof sql>[] = [];
  if (filter.ids) {
    if (filter.ids.length === 0) {
      return [];
    }
    conditions.push(
      sql`c.id in (${sql.join(
        filter.ids.map((id) => sql`${id}::uuid`),
        sql`, `
      )})`
    );
  } else if (!filter.includeSettled) {
    conditions.push(sql`c.amount > c.allocated`);
  }
  if (filter.kind) {
    conditions.push(sql`c.kind = ${filter.kind}`);
  }
  if (filter.from) {
    conditions.push(sql`c.on_day >= ${filter.from}::date`);
  }
  if (filter.to) {
    conditions.push(sql`c.on_day <= ${filter.to}::date`);
  }
  if (filter.minPaise !== null && filter.minPaise !== undefined) {
    conditions.push(sql`c.amount - c.allocated >= ${filter.minPaise}`);
  }
  if (filter.maxPaise !== null && filter.maxPaise !== undefined) {
    conditions.push(sql`c.amount - c.allocated <= ${filter.maxPaise}`);
  }
  const query = filter.query?.trim();
  if (query) {
    const pattern = `%${query.replaceAll(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conditions.push(
      sql`(c.title ilike ${pattern} or c.payee ilike ${pattern})`
    );
  }
  const where =
    conditions.length > 0
      ? sql`where ${sql.join(conditions, sql` and `)}`
      : sql``;
  const rows = (await reader.execute(sql`
    select * from (
      select 'reimbursement' as kind, r.id, r.id as request_id, r.title,
        coalesce(u.name, '') as payee, null::text as reference,
        ${sql.raw(indiaDay("r.reviewed_at"))} as on_day,
        (select coalesce(sum(li.amount_paise), 0) from reimbursement_line_item li
          where li.reimbursement_id = r.id)::bigint as amount,
        (select coalesce(sum(a.amount_paise), 0) from statement_allocation a
          where a.reimbursement_id = r.id and a.released_at is null)::bigint as allocated
      from reimbursement r
      left join "user" u on u.id = r.user_id
      where r.status = 'approved' and r.voided_at is null and r.reviewed_at is not null
      union all
      select 'vendor_payment_transaction' as kind, t.id, v.id as request_id, v.title,
        coalesce(ve.name, '') as payee, t.payment_reference as reference,
        ${sql.raw(indiaDay("t.transaction_date"))} as on_day,
        t.amount_paise::bigint as amount,
        (select coalesce(sum(a.amount_paise), 0) from statement_allocation a
          where a.vendor_payment_transaction_id = t.id and a.released_at is null)::bigint as allocated
      from vendor_payment_transaction t
      join vendor_payment v on v.id = t.vendor_payment_id
      left join vendor ve on ve.id = v.vendor_id
      where t.status = 'approved' and t.voided_at is null and v.voided_at is null
        and v.status in (${payable})
    ) c
    ${where}
    order by c.on_day desc, c.id desc
    limit ${filter.limit ?? 200}`)) as unknown as {
    allocated: number | string;
    amount: number | string;
    id: string;
    kind: StatementDocumentAllocationKind;
    on_day: string | Date;
    payee: string;
    reference: string | null;
    request_id: string;
    title: string;
  }[];
  return rows.map((r) => ({
    allocatedPaise: Number(r.allocated),
    amountPaise: Number(r.amount),
    id: String(r.id),
    kind: r.kind,
    on:
      r.on_day instanceof Date
        ? r.on_day.toISOString().slice(0, 10)
        : String(r.on_day).slice(0, 10),
    payee: r.payee,
    reference: r.reference,
    requestId: String(r.request_id),
    title: r.title,
  }));
}

/** A live allocation, with what it pays. */
export interface LiveAllocation {
  amountPaise: number;
  id: string;
  kind: StatementAllocationKind;
  reimbursementId: string | null;
  statementLineId: string;
  vendorPaymentTransactionId: string | null;
}

const liveColumns = {
  amountPaise: statementAllocation.amountPaise,
  id: statementAllocation.id,
  kind: statementAllocation.kind,
  reimbursementId: statementAllocation.reimbursementId,
  statementLineId: statementAllocation.statementLineId,
  vendorPaymentTransactionId: statementAllocation.vendorPaymentTransactionId,
};

/** The live allocations of some lines. */
export async function liveAllocationsOfLines(
  reader: Pick<typeof db, "select">,
  lineIds: readonly string[]
): Promise<LiveAllocation[]> {
  if (lineIds.length === 0) {
    return [];
  }
  return await reader
    .select(liveColumns)
    .from(statementAllocation)
    .where(
      and(
        inArray(statementAllocation.statementLineId, [...lineIds]),
        isNull(statementAllocation.releasedAt)
      )
    );
}

/** Locks the documents a match pays (in ID order), so their status can't change under it. */
export async function lockDebitDocuments(
  tx: StatementTx,
  items: readonly { id: string; kind: StatementDocumentAllocationKind }[]
): Promise<void> {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  for (const item of sorted) {
    if (item.kind === "reimbursement") {
      await tx
        .select({ id: reimbursement.id })
        .from(reimbursement)
        .where(eq(reimbursement.id, item.id))
        .for("update");
    } else {
      await tx
        .select({ id: vendorPaymentTransaction.id })
        .from(vendorPaymentTransaction)
        .where(eq(vendorPaymentTransaction.id, item.id))
        .for("update");
    }
  }
}

export interface NewAllocation {
  amountPaise: number;
  id: string;
  kind: StatementAllocationKind;
  reimbursementId: string | null;
  vendorPaymentTransactionId: string | null;
}

export async function insertAllocations(
  tx: StatementTx,
  lineId: string,
  rows: readonly NewAllocation[],
  actorId: string,
  now: Date
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await tx.insert(statementAllocation).values(
    rows.map((r) => ({
      ...r,
      createdAt: now,
      createdBy: actorId,
      statementLineId: lineId,
    }))
  );
}

/** Releases every live allocation of a line (an unmatch); returns what they paid. */
export async function releaseLineAllocations(
  tx: StatementTx,
  lineId: string,
  actorId: string,
  now: Date
): Promise<LiveAllocation[]> {
  return await tx
    .update(statementAllocation)
    .set({ releasedAt: now, releasedBy: actorId })
    .where(
      and(
        eq(statementAllocation.statementLineId, lineId),
        isNull(statementAllocation.releasedAt)
      )
    )
    .returning(liveColumns);
}

/**
 * How many live bank allocations pay these claims or payments, read under
 * the statement line lock so a match can't land between this check and the
 * caller's void or delete. Server only: a Zero mutator passes its wrapped
 * transaction.
 */
export async function countLiveDocumentAllocations(
  tx: StatementTx,
  refs: {
    reimbursementIds: readonly string[];
    vendorPaymentTransactionIds: readonly string[];
  }
): Promise<number> {
  if (
    refs.reimbursementIds.length === 0 &&
    refs.vendorPaymentTransactionIds.length === 0
  ) {
    return 0;
  }
  await tx.execute(STATEMENT_LINE_LOCK);
  const owners = [
    ...(refs.reimbursementIds.length > 0
      ? [
          inArray(statementAllocation.reimbursementId, [
            ...refs.reimbursementIds,
          ]),
        ]
      : []),
    ...(refs.vendorPaymentTransactionIds.length > 0
      ? [
          inArray(statementAllocation.vendorPaymentTransactionId, [
            ...refs.vendorPaymentTransactionIds,
          ]),
        ]
      : []),
  ];
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(statementAllocation)
    .where(
      and(
        isNull(statementAllocation.releasedAt),
        owners.length === 1 ? owners[0] : sql`(${sql.join(owners, sql` or `)})`
      )
    );
  return Number(row?.count ?? 0);
}

/**
 * The first closed financial year a bank match would change (layer 3-3b):
 * the year of any of `dates` (the line's own date, from the cutover), or of
 * a standing posting of the sources it moves (a claim's or payment's
 * current postings, the line's own charges). Null when every one is open.
 */
export async function closedYearTouched(
  reader: Reader,
  input: {
    dates: readonly string[];
    sources: readonly { sourceId: string; sourceType: string }[];
  }
): Promise<string | null> {
  const byDate = input.dates.length
    ? sql`exists (select 1 from unnest(array[${sql.join(
        input.dates.map((d) => sql`${d}::date`),
        sql`, `
      )}]) d where d between fy.starts_on and fy.ends_on)`
    : sql`false`;
  const bySource = input.sources.length
    ? sql`exists (select 1 from posting p
        where p.fiscal_year_id = fy.id and p.reverses_posting_id is null
          and not exists (select 1 from posting r where r.reverses_posting_id = p.id)
          and (p.source_type, p.source_id) in (${sql.join(
            input.sources.map(
              (s) => sql`(${s.sourceType}, ${s.sourceId}::uuid)`
            ),
            sql`, `
          )}))`
    : sql`false`;
  const rows = (await reader.execute(sql`
    select fy.label from fiscal_year fy
    where fy.closed_at is not null and (${byDate} or ${bySource})
    order by fy.starts_on limit 1`)) as unknown as { label: string }[];
  return rows[0]?.label ?? null;
}

/**
 * The matched year (audited figures standing) a bank match would move, if
 * any: one ending on or after the line's date, or on or after the start of
 * the year a claim, payment or charge it moves stands in. The engine
 * freezes those years (and every year before a matched one), so the match
 * is refused up front rather than left waiting.
 */
export async function matchedYearTouched(
  reader: Reader,
  input: {
    dates: readonly string[];
    sources: readonly { sourceId: string; sourceType: string }[];
  }
): Promise<string | null> {
  const byDate = input.dates.length
    ? sql`exists (select 1 from unnest(array[${sql.join(
        input.dates.map((d) => sql`${d}::date`),
        sql`, `
      )}]) d where d <= m.ends_on)`
    : sql`false`;
  const bySource = input.sources.length
    ? sql`exists (select 1 from posting p
        join fiscal_year fy on fy.id = p.fiscal_year_id
        where fy.starts_on <= m.ends_on and p.reverses_posting_id is null
          and not exists (select 1 from posting r where r.reverses_posting_id = p.id)
          and (p.source_type, p.source_id) in (${sql.join(
            input.sources.map(
              (s) => sql`(${s.sourceType}, ${s.sourceId}::uuid)`
            ),
            sql`, `
          )}))`
    : sql`false`;
  const rows = (await reader.execute(sql`
    select m.label from fiscal_year m
    join audited_figures a on a.fiscal_year_id = m.id
      and a.status = 'matched' and a.reversed_at is null
    where ${byDate} or ${bySource}
    order by m.starts_on limit 1`)) as unknown as { label: string }[];
  return rows[0]?.label ?? null;
}

/**
 * The bank debit figures of one account, for its reconciliation summary.
 * Every figure counts debits from the cutover only: earlier ones are
 * evidence, never reviewed.
 */
export interface DebitSummary {
  /** Open debits (not matched in full, not ignored), those waiting for a claim included. */
  attentionCount: number;
  debitCount: number;
  debitsMatchedCount: number;
  /** Open debits marked "Needs a claim". */
  needsClaimCount: number;
  /** Open debits, less what their allocations already explain. */
  unexplainedPaise: number;
}

export async function debitSummary(
  reader: Reader,
  orgAccountId: string
): Promise<DebitSummary> {
  const [row] = (await reader.execute(sql`
    select
      count(*)::int as debits,
      count(*) filter (where l.match_status = 'matched')::int as matched,
      count(*) filter (where l.match_status = 'unmatched')::int as open,
      count(*) filter (where l.match_status = 'unmatched' and l.needs_claim_at is not null)::int as needs_claim,
      coalesce(sum(l.amount_paise - coalesce((
          select sum(a.amount_paise) from ${statementAllocation} a
          where a.statement_line_id = l.id and a.released_at is null), 0))
        filter (where l.match_status = 'unmatched'), 0)::bigint as unexplained
    from ${statementLine} l
    where l.org_account_id = ${orgAccountId} and l.direction = 'debit'
      and l.value_on >= ${LEDGER_CUTOVER_ON}::date`)) as unknown as {
    debits: number;
    matched: number;
    needs_claim: number;
    open: number;
    unexplained: number | string;
  }[];
  return {
    attentionCount: Number(row?.open ?? 0),
    debitCount: Number(row?.debits ?? 0),
    debitsMatchedCount: Number(row?.matched ?? 0),
    needsClaimCount: Number(row?.needs_claim ?? 0),
    unexplainedPaise: Number(row?.unexplained ?? 0),
  };
}

/**
 * Approved claims and vendor payments dated from the cutover that no bank
 * debit pays in full yet: "Paid per approval, not seen in the bank".
 */
export async function unseenPayments(
  reader: Reader,
  limit = 500
): Promise<DebitDocument[]> {
  return await listDebitDocuments(reader, { from: LEDGER_CUTOVER_ON, limit });
}
