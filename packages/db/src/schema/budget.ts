import { relations, sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  accountHead,
  fiscalYear,
  programme,
  project,
} from "./finance-dimensions";

/**
 * A financial year's budget for a programme, or for one project under it.
 * Actuals are never stored: they are read from the books.
 */
export const budget = pgTable(
  "budget",
  {
    createdAt: timestamp("created_at").notNull(),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => fiscalYear.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    note: text("note"),
    programmeId: uuid("programme_id")
      .notNull()
      .references(() => programme.id, { onDelete: "restrict" }),
    projectId: uuid("project_id"),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    // One programme budget and one per project, per year.
    unique("budget_scope_unique")
      .on(t.fiscalYearId, t.programmeId, t.projectId)
      .nullsNotDistinct(),
    // A project must sit under the budget's programme.
    foreignKey({
      columns: [t.projectId, t.programmeId],
      foreignColumns: [project.id, project.programmeId],
      name: "budget_project_programme_fk",
    }).onDelete("restrict"),
  ]
);

/** One expense head's amount in a budget. A head without a line has no budget. */
export const budgetLine = pgTable(
  "budget_line",
  {
    accountHeadId: uuid("account_head_id")
      .notNull()
      .references(() => accountHead.id, { onDelete: "restrict" }),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
  },
  (t) => [
    unique("budget_line_budget_head_unique").on(t.budgetId, t.accountHeadId),
    check("budget_line_amount_check", sql`${t.amountPaise} >= 0`),
  ]
);

export const budgetRelations = relations(budget, ({ many }) => ({
  lines: many(budgetLine),
}));

export const budgetLineRelations = relations(budgetLine, ({ one }) => ({
  budget: one(budget, {
    fields: [budgetLine.budgetId],
    references: [budget.id],
  }),
}));
