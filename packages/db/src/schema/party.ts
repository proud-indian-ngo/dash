import { partyKindValues, partyRoleValues } from "@pi-dash/shared/constants";
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const partyKindEnum = pgEnum("party_kind", partyKindValues);
export const partyRoleEnum = pgEnum("party_role_kind", partyRoleValues);

/**
 * One identity per person or organisation money touches: donor, sponsor,
 * vendor, volunteer. Only identity fields live here and sync to the browser;
 * contact, tax and bank details are in `schema/private/party-private.ts`.
 */
export const party = pgTable(
  "party",
  {
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    id: uuid("id").primaryKey(),
    kind: partyKindEnum("kind").notNull(),
    legalName: text("legal_name"),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [index("party_displayName_idx").on(t.displayName)]
);

export const partyRole = pgTable(
  "party_role",
  {
    active: boolean("active").default(true).notNull(),
    id: uuid("id").primaryKey(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id, { onDelete: "cascade" }),
    role: partyRoleEnum("role").notNull(),
    since: timestamp("since").notNull(),
  },
  (t) => [
    uniqueIndex("party_role_partyId_role_uidx").on(t.partyId, t.role),
    index("party_role_role_idx").on(t.role),
  ]
);

export const partyRelations = relations(party, ({ many }) => ({
  roles: many(partyRole),
}));

export const partyRoleRelations = relations(partyRole, ({ one }) => ({
  party: one(party, { fields: [partyRole.partyId], references: [party.id] }),
}));
