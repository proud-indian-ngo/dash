import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const role = pgTable("role", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  description: text("description"),
  id: text("id").primaryKey(),
  isSystem: boolean("is_system").default(false).notNull(),
  name: text("name").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const permission = pgTable("permission", {
  category: text("category").notNull(),
  description: text("description"),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const rolePermission = pgTable(
  "role_permission",
  {
    permissionId: text("permission_id")
      .notNull()
      .references(() => permission.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("role_permission_permission_id_idx").on(table.permissionId),
  ]
);

export const roleRelations = relations(role, ({ many }) => ({
  permissions: many(rolePermission),
}));

export const rolePermissionRelations = relations(rolePermission, ({ one }) => ({
  permission: one(permission, {
    fields: [rolePermission.permissionId],
    references: [permission.id],
  }),
  role: one(role, {
    fields: [rolePermission.roleId],
    references: [role.id],
  }),
}));
