import { KALAKRITI_INVENTORY_TYPES } from "@pi-dash/shared/kalakriti-inventory";
import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import {
  kalakritiCompetition,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiResponsibilityEnum,
} from "./kalakriti";

export const kalakritiInventoryTypeEnum = pgEnum(
  "kalakriti_inventory_type",
  KALAKRITI_INVENTORY_TYPES
);

export const kalakritiInventoryItem = pgTable(
  "kalakriti_inventory_item",
  {
    id: uuid("id").primaryKey(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => kalakritiEdition.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull().default(0),
    photoKey: text("photo_key").unique(),
    photoName: text("photo_name"),
    photoMimeType: text("photo_mime_type"),
    photoSize: integer("photo_size"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    unique("kalakriti_inventory_item_edition_id_uq").on(t.editionId, t.id),
    index("kalakriti_inventory_item_edition_name_idx").on(
      t.editionId,
      t.name,
      t.id
    ),
    check("kalakriti_inventory_item_quantity_chk", sql`${t.quantity} >= 0`),
    check("kalakriti_inventory_item_price_chk", sql`${t.unitPricePaise} >= 0`),
    check(
      "kalakriti_inventory_item_name_chk",
      sql`length(trim(${t.name})) BETWEEN 1 AND 120`
    ),
    check(
      "kalakriti_inventory_item_archived_chk",
      sql`${t.archivedAt} IS NULL OR ${t.quantity} = 0`
    ),
    check(
      "kalakriti_inventory_item_photo_chk",
      sql`(${t.photoKey} IS NULL AND ${t.photoName} IS NULL AND ${t.photoMimeType} IS NULL AND ${t.photoSize} IS NULL) OR (${t.photoKey} IS NOT NULL AND ${t.photoName} IS NOT NULL AND ${t.photoMimeType} IS NOT NULL AND ${t.photoSize} IS NOT NULL AND ${t.photoSize} > 0 AND ${t.photoSize} <= 5242880)`
    ),
  ]
);

export const kalakritiInventoryTransaction = pgTable(
  "kalakriti_inventory_transaction",
  {
    id: uuid("id").primaryKey(),
    editionId: uuid("edition_id").notNull(),
    itemId: uuid("item_id").notNull(),
    type: kalakritiInventoryTypeEnum("type").notNull(),
    quantity: integer("quantity").notNull(),
    quantityBefore: integer("quantity_before").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    volunteerMembershipId: uuid("volunteer_membership_id"),
    competitionId: uuid("competition_id"),
    responsibility: kalakritiResponsibilityEnum("responsibility"),
    notes: text("notes"),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.editionId, t.itemId],
      foreignColumns: [
        kalakritiInventoryItem.editionId,
        kalakritiInventoryItem.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.editionId, t.volunteerMembershipId],
      foreignColumns: [
        kalakritiEditionMembership.editionId,
        kalakritiEditionMembership.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.editionId, t.competitionId],
      foreignColumns: [kalakritiCompetition.editionId, kalakritiCompetition.id],
    }).onDelete("restrict"),
    index("kalakriti_inventory_tx_edition_created_idx").on(
      t.editionId,
      t.createdAt.desc(),
      t.id
    ),
    index("kalakriti_inventory_tx_item_created_idx").on(
      t.itemId,
      t.createdAt.desc(),
      t.id
    ),
    check(
      "kalakriti_inventory_tx_balances_chk",
      sql`${t.quantityBefore} >= 0 AND ${t.quantityAfter} >= 0 AND ${t.quantityAfter}::bigint = ${t.quantityBefore}::bigint + ${t.quantity}::bigint`
    ),
    check(
      "kalakriti_inventory_tx_type_chk",
      sql`(${t.type} = 'initial_inventory' AND ${t.quantityBefore} = 0 AND ${t.quantity} >= 0) OR (${t.type} IN ('purchase', 'return') AND ${t.quantity} > 0) OR (${t.type} = 'dispatch' AND ${t.quantity} < 0) OR (${t.type} = 'adjustment' AND ${t.notes} IS NOT NULL AND length(trim(${t.notes})) > 0)`
    ),
    check(
      "kalakriti_inventory_tx_volunteer_chk",
      sql`${t.type} NOT IN ('dispatch', 'return') OR ${t.volunteerMembershipId} IS NOT NULL`
    ),
    check(
      "kalakriti_inventory_tx_assignment_chk",
      sql`${t.responsibility} IS NULL OR (${t.type} IN ('dispatch', 'return') AND ${t.competitionId} IS NULL)`
    ),
  ]
);

export const kalakritiInventoryItemRelations = relations(
  kalakritiInventoryItem,
  ({ one, many }) => ({
    edition: one(kalakritiEdition, {
      fields: [kalakritiInventoryItem.editionId],
      references: [kalakritiEdition.id],
    }),
    transactions: many(kalakritiInventoryTransaction),
  })
);

export const kalakritiInventoryTransactionRelations = relations(
  kalakritiInventoryTransaction,
  ({ one }) => ({
    edition: one(kalakritiEdition, {
      fields: [kalakritiInventoryTransaction.editionId],
      references: [kalakritiEdition.id],
    }),
    item: one(kalakritiInventoryItem, {
      fields: [
        kalakritiInventoryTransaction.editionId,
        kalakritiInventoryTransaction.itemId,
      ],
      references: [kalakritiInventoryItem.editionId, kalakritiInventoryItem.id],
    }),
    volunteer: one(kalakritiEditionMembership, {
      fields: [
        kalakritiInventoryTransaction.editionId,
        kalakritiInventoryTransaction.volunteerMembershipId,
      ],
      references: [
        kalakritiEditionMembership.editionId,
        kalakritiEditionMembership.id,
      ],
    }),
    competition: one(kalakritiCompetition, {
      fields: [
        kalakritiInventoryTransaction.editionId,
        kalakritiInventoryTransaction.competitionId,
      ],
      references: [kalakritiCompetition.editionId, kalakritiCompetition.id],
    }),
    actor: one(user, {
      fields: [kalakritiInventoryTransaction.actorUserId],
      references: [user.id],
    }),
  })
);
