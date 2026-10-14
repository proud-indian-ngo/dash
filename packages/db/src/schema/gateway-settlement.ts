import {
  gatewaySettlementItemTypeValues,
  gatewaySettlementProviderValues,
  gatewaySettlementStatusValues,
} from "@pi-dash/shared/constants";
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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

import { orgAccount } from "./finance-dimensions";
import { contribution, contributionRefund } from "./income";

export const gatewaySettlementProviderEnum = pgEnum(
  "gateway_settlement_provider",
  gatewaySettlementProviderValues
);
export const gatewaySettlementStatusEnum = pgEnum(
  "gateway_settlement_status",
  gatewaySettlementStatusValues
);
export const gatewaySettlementItemTypeEnum = pgEnum(
  "gateway_settlement_item_type",
  gatewaySettlementItemTypeValues
);

/**
 * Money a payment gateway paid out of its clearing balance into the bank.
 * Written only by the server (the Razorpay settlement sync); synced through
 * Zero, read-only, to finance.view and finance.manage holders. Holds IDs,
 * amounts, dates and the bank reference (UTR), no personal data. A
 * settlement never creates or changes a contribution, and makes no posting
 * or movement yet (the posting layer will turn it into a transfer out of
 * clearing and into the bank).
 */
export const gatewaySettlement = pgTable(
  "gateway_settlement",
  {
    /** Net paid out, as the gateway reported it first. */
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    /**
     * The gateway later reported another amount; the first is kept. Needs
     * the founder's look.
     */
    amountChanged: boolean("amount_changed").default(false).notNull(),
    createdAt: timestamp("created_at").notNull(),
    /** The gateway's settlement ID (Razorpay `setl_…`). */
    externalId: text("external_id").notNull(),
    /** Fees, excluding GST, on its lines. */
    feesPaise: bigint("fees_paise", { mode: "number" }).default(0).notNull(),
    /** Payments it settled, before fees: the sum of its payment lines' amounts. */
    grossPaise: bigint("gross_paise", { mode: "number" }).default(0).notNull(),
    id: uuid("id").primaryKey(),
    /** Lines stored for it: payments, refunds, transfers and adjustments. */
    itemCount: integer("item_count").default(0).notNull(),
    paymentCount: integer("payment_count").default(0).notNull(),
    /** The clearing account it paid out of, as configured when first seen. */
    orgAccountId: uuid("org_account_id").references(() => orgAccount.id, {
      onDelete: "restrict",
    }),
    provider: gatewaySettlementProviderEnum("provider").notNull(),
    /** Refunds it paid back out of the payout: the sum of its refund lines' amounts. */
    refundsPaise: bigint("refunds_paise", { mode: "number" })
      .default(0)
      .notNull(),
    /** Which account at the provider: Razorpay's live or test mode. */
    providerAccount: text("provider_account").notNull(),
    /** India date of the settlement. */
    settledOn: date("settled_on").notNull(),
    /**
     * Razorpay's fee on the payout itself (an instant settlement), excluding
     * GST; null when Razorpay reported none. Taken out of the payout on top
     * of its lines' fees.
     */
    settlementFeePaise: bigint("settlement_fee_paise", { mode: "number" }),
    /** GST on the payout's own fee. */
    settlementTaxPaise: bigint("settlement_tax_paise", { mode: "number" }),
    status: gatewaySettlementStatusEnum("status").notNull(),
    /** GST on its lines' fees. */
    taxPaise: bigint("tax_paise", { mode: "number" }).default(0).notNull(),
    /**
     * Recon lines naming it that pi-dash could not read (another currency,
     * or a shape it does not know), so its lines may not add up.
     */
    unreadableLineCount: integer("unreadable_line_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    /** Bank reference of the payout, to match the bank statement. */
    utr: text("utr"),
  },
  (t) => [
    uniqueIndex("gateway_settlement_key_uidx").on(
      t.provider,
      t.providerAccount,
      t.externalId
    ),
    index("gateway_settlement_settledOn_idx").on(t.settledOn),
    check(
      "gateway_settlement_amounts_nonnegative",
      sql`${t.amountPaise} >= 0 AND ${t.feesPaise} >= 0 AND ${t.taxPaise} >= 0 AND ${t.grossPaise} >= 0 AND ${t.refundsPaise} >= 0 AND coalesce(${t.settlementFeePaise}, 0) >= 0 AND coalesce(${t.settlementTaxPaise}, 0) >= 0`
    ),
  ]
);

/**
 * One line of a settlement: a payment, refund, transfer or adjustment it
 * covered. A payment line links to the contribution its payment became and
 * a refund line to the recorded refund; a line whose payment or refund is
 * not imported yet stays unlinked and is linked when it is. Neither
 * Razorpay's notes nor its descriptions are kept.
 */
export const gatewaySettlementItem = pgTable(
  "gateway_settlement_item",
  {
    /** Deleting the contribution unlinks the line; a re-import links it again. */
    contributionId: uuid("contribution_id").references(() => contribution.id, {
      onDelete: "set null",
    }),
    contributionRefundId: uuid("contribution_refund_id").references(
      () => contributionRefund.id,
      { onDelete: "set null" }
    ),
    /** Added to the clearing balance's payout. */
    creditPaise: bigint("credit_paise", { mode: "number" })
      .default(0)
      .notNull(),
    /** Taken from the payout. */
    debitPaise: bigint("debit_paise", { mode: "number" }).default(0).notNull(),
    /** The gateway's ID of what was settled (`pay_…`, `rfnd_…`, `adj_…`). */
    externalId: text("external_id").notNull(),
    /** Fee excluding GST, as contributions keep it. */
    feePaise: bigint("fee_paise", { mode: "number" }).default(0).notNull(),
    id: uuid("id").primaryKey(),
    settledAt: timestamp("settled_at").notNull(),
    settlementId: uuid("settlement_id")
      .notNull()
      .references(() => gatewaySettlement.id, { onDelete: "cascade" }),
    taxPaise: bigint("tax_paise", { mode: "number" }).default(0).notNull(),
    type: gatewaySettlementItemTypeEnum("type").notNull(),
  },
  (t) => [
    uniqueIndex("gateway_settlement_item_key_uidx").on(
      t.settlementId,
      t.type,
      t.externalId
    ),
    // Linking a payment or refund when it is imported, and the sheet's lookup.
    index("gateway_settlement_item_type_externalId_idx").on(
      t.type,
      t.externalId
    ),
    index("gateway_settlement_item_contributionId_idx").on(t.contributionId),
    index("gateway_settlement_item_contributionRefundId_idx").on(
      t.contributionRefundId
    ),
    check(
      "gateway_settlement_item_amounts_nonnegative",
      sql`${t.creditPaise} >= 0 AND ${t.debitPaise} >= 0 AND ${t.feePaise} >= 0 AND ${t.taxPaise} >= 0`
    ),
  ]
);

export const gatewaySettlementRelations = relations(
  gatewaySettlement,
  ({ many, one }) => ({
    items: many(gatewaySettlementItem),
    orgAccount: one(orgAccount, {
      fields: [gatewaySettlement.orgAccountId],
      references: [orgAccount.id],
    }),
  })
);

export const gatewaySettlementItemRelations = relations(
  gatewaySettlementItem,
  ({ one }) => ({
    contribution: one(contribution, {
      fields: [gatewaySettlementItem.contributionId],
      references: [contribution.id],
    }),
    refund: one(contributionRefund, {
      fields: [gatewaySettlementItem.contributionRefundId],
      references: [contributionRefund.id],
    }),
    settlement: one(gatewaySettlement, {
      fields: [gatewaySettlementItem.settlementId],
      references: [gatewaySettlement.id],
    }),
  })
);
