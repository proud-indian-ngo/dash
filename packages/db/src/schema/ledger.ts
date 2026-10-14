import {
  fiscalYearEventActionValues,
  ledgerEffectValues,
  ledgerMediumValues,
  movementDirectionValues,
  movementKindValues,
} from "@pi-dash/shared/ledger";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
import {
  accountHead,
  costCentre,
  fiscalPeriod,
  fiscalYear,
  fund,
  orgAccount,
  programme,
  project,
} from "./finance-dimensions";
import { party } from "./party";
import { teamEvent } from "./team-event";

/*
 * The books (finance Phase 3, docs/architecture/finance-and-programmes.md
 * section 3.8). `posting`, `ledger_entry`, `account_movement` and
 * `movement_allocation` are append-only: rows are written only by the
 * server-side posting engine (packages/db/src/ledger/engine.ts), a database
 * trigger rejects UPDATE and DELETE on them, and a correction is a reversal
 * posting plus a replacement. Synced read-only through Zero to finance.view
 * and finance.manage holders.
 */

export const ledgerEffectEnum = pgEnum("ledger_effect", ledgerEffectValues);
export const ledgerMediumEnum = pgEnum("ledger_medium", ledgerMediumValues);
export const accountMovementDirectionEnum = pgEnum(
  "account_movement_direction",
  movementDirectionValues
);
export const accountMovementKindEnum = pgEnum(
  "account_movement_kind",
  movementKindValues
);
export const fiscalYearEventActionEnum = pgEnum(
  "fiscal_year_event_action",
  fiscalYearEventActionValues
);

/**
 * One source action turned into books, at most once: the unique
 * (source_type, source_id, source_revision, action) is the idempotency key.
 */
export const posting = pgTable(
  "posting",
  {
    action: text("action").notNull(),
    createdAt: timestamp("created_at").notNull(),
    /**
     * The user who posted, kept as a plain ID (like `audit_log`) so deleting
     * the login never rewrites the ledger; null for system postings.
     */
    createdBy: text("created_by"),
    /** The business date of the source action (yyyy-MM-dd). */
    economicOn: date("economic_on").notNull(),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => fiscalYear.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    /** The day it was written, in India. */
    postedOn: date("posted_on").notNull(),
    /** Why a reversal was made; null for ordinary postings. */
    reason: text("reason"),
    reversesPostingId: uuid("reverses_posting_id").references(
      (): AnyPgColumn => posting.id,
      { onDelete: "restrict" }
    ),
    sourceId: uuid("source_id").notNull(),
    sourceRevision: integer("source_revision").default(1).notNull(),
    sourceType: text("source_type").notNull(),
  },
  (t) => [
    uniqueIndex("posting_idempotency_uidx").on(
      t.sourceType,
      t.sourceId,
      t.sourceRevision,
      t.action
    ),
    // A posting is reversed at most once.
    uniqueIndex("posting_reverses_uidx")
      .on(t.reversesPostingId)
      .where(sql`${t.reversesPostingId} IS NOT NULL`),
    index("posting_fiscalYearId_idx").on(t.fiscalYearId),
    check("posting_source_revision_check", sql`${t.sourceRevision} >= 1`),
  ]
);

/** Recognition: what the trust earned, spent, owns, owes or holds in a fund. */
export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    accountHeadId: uuid("account_head_id")
      .notNull()
      .references(() => accountHead.id, { onDelete: "restrict" }),
    /** Always positive; the effect gives the sign. */
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    costCentreId: uuid("cost_centre_id").references(() => costCentre.id, {
      onDelete: "restrict",
    }),
    economicOn: date("economic_on").notNull(),
    effect: ledgerEffectEnum("effect").notNull(),
    eventId: uuid("event_id").references(() => teamEvent.id, {
      onDelete: "restrict",
    }),
    fiscalPeriodId: uuid("fiscal_period_id")
      .notNull()
      .references(() => fiscalPeriod.id, { onDelete: "restrict" }),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => fund.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    medium: ledgerMediumEnum("medium").default("monetary").notNull(),
    /** What the line is, such as the asset an opening line names. */
    memo: text("memo"),
    partyId: uuid("party_id").references(() => party.id, {
      onDelete: "restrict",
    }),
    postedOn: date("posted_on").notNull(),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => posting.id, { onDelete: "restrict" }),
    programmeId: uuid("programme_id").references(() => programme.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "restrict",
    }),
    reversesEntryId: uuid("reverses_entry_id").references(
      (): AnyPgColumn => ledgerEntry.id,
      { onDelete: "restrict" }
    ),
    /** The source document line, when the source has lines. */
    sourceLineId: uuid("source_line_id"),
  },
  (t) => [
    index("ledger_entry_postingId_idx").on(t.postingId),
    index("ledger_entry_economicOn_idx").on(t.economicOn, t.id),
    index("ledger_entry_accountHeadId_idx").on(t.accountHeadId),
    index("ledger_entry_fiscalPeriodId_idx").on(t.fiscalPeriodId),
    check("ledger_entry_amount_check", sql`${t.amountPaise} > 0`),
  ]
);

/** Cash book: money that came into or left one of the trust's own accounts. */
export const accountMovement = pgTable(
  "account_movement",
  {
    /** Always positive; the direction gives the sign. */
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    bankValueOn: date("bank_value_on"),
    direction: accountMovementDirectionEnum("direction").notNull(),
    fiscalPeriodId: uuid("fiscal_period_id")
      .notNull()
      .references(() => fiscalPeriod.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    kind: accountMovementKindEnum("kind").notNull(),
    memo: text("memo"),
    occurredOn: date("occurred_on").notNull(),
    orgAccountId: uuid("org_account_id")
      .notNull()
      .references(() => orgAccount.id, { onDelete: "restrict" }),
    paymentReference: text("payment_reference"),
    postedOn: date("posted_on").notNull(),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => posting.id, { onDelete: "restrict" }),
    reversesMovementId: uuid("reverses_movement_id").references(
      (): AnyPgColumn => accountMovement.id,
      { onDelete: "restrict" }
    ),
    /** Shared by the out and in legs of a transfer between own accounts. */
    transferId: uuid("transfer_id"),
  },
  (t) => [
    index("account_movement_postingId_idx").on(t.postingId),
    index("account_movement_account_occurredOn_idx").on(
      t.orgAccountId,
      t.occurredOn,
      t.id
    ),
    index("account_movement_transferId_idx").on(t.transferId),
    check("account_movement_amount_check", sql`${t.amountPaise} > 0`),
  ]
);

/** What a movement paid or received against (layer 3-3 writes these). */
export const movementAllocation = pgTable(
  "movement_allocation",
  {
    accountMovementId: uuid("account_movement_id")
      .notNull()
      .references(() => accountMovement.id, { onDelete: "restrict" }),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").notNull(),
    documentId: uuid("document_id").notNull(),
    documentType: text("document_type").notNull(),
    id: uuid("id").primaryKey(),
  },
  (t) => [
    index("movement_allocation_movementId_idx").on(t.accountMovementId),
    index("movement_allocation_document_idx").on(t.documentType, t.documentId),
    check("movement_allocation_amount_check", sql`${t.amountPaise} > 0`),
  ]
);

/**
 * The opening-balance document: the CA-confirmed balances the books start
 * from, posted once per fiscal year as one posting (opening movements into
 * the accounts, opening asset, liability and fund entries). A correction
 * reverses it and posts a new document.
 */
export const openingBalance = pgTable(
  "opening_balance",
  {
    /** First day of the year (yyyy-MM-dd). */
    asOn: date("as_on").notNull(),
    caConfirmedOn: date("ca_confirmed_on").notNull(),
    caName: text("ca_name").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => fiscalYear.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => posting.id, { onDelete: "restrict" }),
    reversalPostingId: uuid("reversal_posting_id").references(
      () => posting.id,
      { onDelete: "restrict" }
    ),
    reversedAt: timestamp("reversed_at"),
    reversedBy: text("reversed_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("opening_balance_postingId_uidx").on(t.postingId),
    // One standing opening balance per year.
    uniqueIndex("opening_balance_live_year_uidx")
      .on(t.fiscalYearId)
      .where(sql`${t.reversalPostingId} IS NULL`),
  ]
);

/** Year close and reopen history; a reopen carries its reason. */
export const fiscalYearEvent = pgTable(
  "fiscal_year_event",
  {
    action: fiscalYearEventActionEnum("action").notNull(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => fiscalYear.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    occurredAt: timestamp("occurred_at").notNull(),
    reason: text("reason"),
  },
  (t) => [index("fiscal_year_event_year_idx").on(t.fiscalYearId, t.occurredAt)]
);

export const postingRelations = relations(posting, ({ many, one }) => ({
  entries: many(ledgerEntry),
  fiscalYear: one(fiscalYear, {
    fields: [posting.fiscalYearId],
    references: [fiscalYear.id],
  }),
  movements: many(accountMovement),
}));

export const ledgerEntryRelations = relations(ledgerEntry, ({ one }) => ({
  accountHead: one(accountHead, {
    fields: [ledgerEntry.accountHeadId],
    references: [accountHead.id],
  }),
  fund: one(fund, { fields: [ledgerEntry.fundId], references: [fund.id] }),
  posting: one(posting, {
    fields: [ledgerEntry.postingId],
    references: [posting.id],
  }),
  programme: one(programme, {
    fields: [ledgerEntry.programmeId],
    references: [programme.id],
  }),
}));

export const accountMovementRelations = relations(
  accountMovement,
  ({ one }) => ({
    orgAccount: one(orgAccount, {
      fields: [accountMovement.orgAccountId],
      references: [orgAccount.id],
    }),
    posting: one(posting, {
      fields: [accountMovement.postingId],
      references: [posting.id],
    }),
  })
);

export const openingBalanceRelations = relations(openingBalance, ({ one }) => ({
  fiscalYear: one(fiscalYear, {
    fields: [openingBalance.fiscalYearId],
    references: [fiscalYear.id],
  }),
  posting: one(posting, {
    fields: [openingBalance.postingId],
    references: [posting.id],
  }),
}));

export const fiscalYearEventRelations = relations(
  fiscalYearEvent,
  ({ one }) => ({
    actor: one(user, {
      fields: [fiscalYearEvent.actorId],
      references: [user.id],
    }),
  })
);
