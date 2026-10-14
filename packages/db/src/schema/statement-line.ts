import {
  statementLineDirectionValues,
  statementLineIgnoreReasonValues,
  statementLineMatchKindValues,
  statementLineMatchStatusValues,
} from "@pi-dash/shared/constants";
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { orgAccount } from "./finance-dimensions";
import { gatewaySettlement } from "./gateway-settlement";
import { importBatch } from "./import-batch";
import { contribution } from "./income";
import { jsonb } from "./jsonb";

export const statementLineDirectionEnum = pgEnum(
  "statement_line_direction",
  statementLineDirectionValues
);
export const statementLineMatchStatusEnum = pgEnum(
  "statement_line_match_status",
  statementLineMatchStatusValues
);
export const statementLineMatchKindEnum = pgEnum(
  "statement_line_match_kind",
  statementLineMatchKindValues
);
export const statementLineIgnoreReasonEnum = pgEnum(
  "statement_line_ignore_reason",
  statementLineIgnoreReasonValues
);

/**
 * One line of an imported bank statement: money into or out of one of the
 * trust's bank accounts as the bank printed it. Created only by the bank
 * statement import (server); matched, ignored and unmatched only through
 * the audited server functions and the contribution mutator. Synced through
 * Zero to finance.view and finance.manage holders only: the narration names
 * payers, so PAN- and Aadhaar-shaped runs in it are masked at import.
 *
 * A line never creates or changes a donation by itself. A match ties it to
 * what explains it (a settlement, a contribution deposited straight into
 * the account, a give.do payout, a transfer); the posting layer will turn
 * matches into reconciliation allocations against account movements.
 *
 * The link lives only here (not on the settlement or the contribution): the
 * line is what is being reconciled, the partial unique indexes keep each
 * settlement and contribution on one line at most, and the settlement row
 * keeps a single writer, the Razorpay sync.
 */
export const statementLine = pgTable(
  "statement_line",
  {
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    /** Running balance as printed, when the file has one; may be negative. */
    balancePaise: bigint("balance_paise", { mode: "number" }),
    createdAt: timestamp("created_at").notNull(),
    direction: statementLineDirectionEnum("direction").notNull(),
    /**
     * Suggestions a reviewer turned down ("Not this"): settlement or
     * contribution IDs, or "giveindia_payout"; never suggested again.
     */
    dismissedSuggestions: jsonb("dismissed_suggestions")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    /** Set with match_status `ignored`. */
    ignoredReason: statementLineIgnoreReasonEnum("ignored_reason"),
    id: uuid("id").primaryKey(),
    /** The upload that first brought the line in. */
    importBatchId: uuid("import_batch_id").references(() => importBatch.id, {
      onDelete: "set null",
    }),
    /**
     * Keyed hash (`h1:`) of the account, date, direction, amount, reference,
     * folded narration, printed balance and the line's occurrence among
     * identical lines of its file: the same line in an overlapping upload
     * hashes the same, so it is never stored twice.
     */
    lineHash: text("line_hash").notNull(),
    matchedAt: timestamp("matched_at"),
    matchedBy: text("matched_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Restrict: unmatch the line before deleting the contribution. */
    matchedContributionId: uuid("matched_contribution_id").references(
      () => contribution.id,
      { onDelete: "restrict" }
    ),
    matchedSettlementId: uuid("matched_settlement_id").references(
      () => gatewaySettlement.id,
      { onDelete: "restrict" }
    ),
    /** Set with match_status `matched`. */
    matchKind: statementLineMatchKindEnum("match_kind"),
    /** Why it was matched: a `statementLineMatchReasonValues` code. */
    matchReason: text("match_reason"),
    matchStatus: statementLineMatchStatusEnum("match_status")
      .default("unmatched")
      .notNull(),
    /** Bank text, PAN- and Aadhaar-shaped runs masked to their last four. */
    narration: text("narration").default("").notNull(),
    /** A reviewer's short note (an ignore reason of "other", a transfer). */
    note: text("note"),
    orgAccountId: uuid("org_account_id")
      .notNull()
      .references(() => orgAccount.id, { onDelete: "restrict" }),
    /**
     * Order within its file, oldest first whichever way the bank listed it,
     * so the last line of a day gives the closing balance.
     */
    position: integer("position").notNull(),
    /** Cheque number, UTR or UPI reference as the bank gave it. */
    reference: text("reference"),
    suggestedContributionId: uuid("suggested_contribution_id").references(
      () => contribution.id,
      { onDelete: "set null" }
    ),
    /**
     * The trust's other account in a transfer (the fixed deposit, another
     * bank account): set only with match kind `transfer`, so the books can
     * post both legs.
     */
    transferOrgAccountId: uuid("transfer_org_account_id").references(
      () => orgAccount.id,
      { onDelete: "restrict" }
    ),
    /** An unmatched line's best candidate, for a reviewer to accept or turn down. */
    suggestedKind: statementLineMatchKindEnum("suggested_kind"),
    suggestedSettlementId: uuid("suggested_settlement_id").references(
      () => gatewaySettlement.id,
      { onDelete: "set null" }
    ),
    /** A `statementLineMatchReasonValues` code. */
    suggestionReason: text("suggestion_reason"),
    updatedAt: timestamp("updated_at").notNull(),
    valueOn: date("value_on").notNull(),
  },
  (t) => [
    uniqueIndex("statement_line_account_hash_uidx").on(
      t.orgAccountId,
      t.lineHash
    ),
    index("statement_line_account_valueOn_idx").on(t.orgAccountId, t.valueOn),
    index("statement_line_importBatchId_idx").on(t.importBatchId),
    // One line per settlement and per contribution.
    uniqueIndex("statement_line_matched_settlement_uidx")
      .on(t.matchedSettlementId)
      .where(sql`${t.matchedSettlementId} is not null`),
    uniqueIndex("statement_line_matched_contribution_uidx")
      .on(t.matchedContributionId)
      .where(sql`${t.matchedContributionId} is not null`),
    index("statement_line_suggestedSettlementId_idx").on(
      t.suggestedSettlementId
    ),
    index("statement_line_suggestedContributionId_idx").on(
      t.suggestedContributionId
    ),
    check("statement_line_amount_positive", sql`${t.amountPaise} > 0`),
    check(
      "statement_line_match_consistent",
      sql`(${t.matchStatus}::text = 'matched') = (${t.matchKind} is not null)
        and (coalesce(${t.matchKind}::text, '') = 'settlement') = (${t.matchedSettlementId} is not null)
        and (coalesce(${t.matchKind}::text, '') = 'contribution') = (${t.matchedContributionId} is not null)
        and (${t.matchStatus}::text = 'ignored') = (${t.ignoredReason} is not null)`
    ),
    check(
      "statement_line_transfer_account",
      sql`${t.transferOrgAccountId} is null or (coalesce(${t.matchKind}::text, '') = 'transfer' and ${t.transferOrgAccountId} <> ${t.orgAccountId})`
    ),
    // Settlements, contributions and give.do payouts are money in.
    check(
      "statement_line_credit_matches",
      sql`${t.direction}::text = 'credit' or coalesce(${t.matchKind}::text, 'other') in ('transfer', 'other')`
    ),
  ]
);

export const statementLineRelations = relations(statementLine, ({ one }) => ({
  importBatch: one(importBatch, {
    fields: [statementLine.importBatchId],
    references: [importBatch.id],
  }),
  matchedByUser: one(user, {
    fields: [statementLine.matchedBy],
    references: [user.id],
  }),
  matchedContribution: one(contribution, {
    fields: [statementLine.matchedContributionId],
    references: [contribution.id],
  }),
  matchedSettlement: one(gatewaySettlement, {
    fields: [statementLine.matchedSettlementId],
    references: [gatewaySettlement.id],
  }),
  orgAccount: one(orgAccount, {
    fields: [statementLine.orgAccountId],
    references: [orgAccount.id],
  }),
  suggestedContribution: one(contribution, {
    fields: [statementLine.suggestedContributionId],
    references: [contribution.id],
  }),
  suggestedSettlement: one(gatewaySettlement, {
    fields: [statementLine.suggestedSettlementId],
    references: [gatewaySettlement.id],
  }),
}));
