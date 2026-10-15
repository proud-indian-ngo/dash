import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { accountHead } from "./finance-dimensions";

export const expenseCategory = pgTable(
  "expense_category",
  {
    /**
     * The account head its expenses post under (finance layer 3-3a). Set by
     * the books' reference data, which creates one expense head per
     * category under "Expenses"; null until then.
     */
    accountHeadId: uuid("account_head_id").references(() => accountHead.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at").notNull(),
    description: text("description"),
    id: uuid("id").primaryKey(),
    name: text("name").notNull().unique(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [index("expense_category_accountHeadId_idx").on(t.accountHeadId)]
);
