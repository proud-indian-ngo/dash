import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { notification } from "./notification";
import { role } from "./permission";

export type UserRole = string;

const userGenderEnumValues = ["male", "female"] as const;
export type UserGender = (typeof userGenderEnumValues)[number];
export const userGenderEnum = pgEnum("user_gender", userGenderEnumValues);

export const user = pgTable("user", {
  banExpires: timestamp("ban_expires"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  dob: date("dob", { mode: "date" }),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  gender: userGenderEnum("gender"),
  id: text("id").primaryKey(),
  image: text("image"),
  isActive: boolean("is_active").default(true).notNull(),
  isOnWhatsapp: boolean("is_on_whatsapp").default(false).notNull(),
  name: text("name").notNull(),
  phone: text("phone").unique(),
  role: text("role")
    .default("unoriented_volunteer")
    .notNull()
    .references(() => role.id),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    impersonatedBy: text("impersonated_by"),
    ipAddress: text("ip_address"),
    token: text("token").notNull().unique(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    accountId: text("account_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = pgTable(
  "verification",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    value: text("value").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const userRelations = relations(user, ({ one, many }) => ({
  accounts: many(account),
  notifications: many(notification),
  notificationTopicPreferences: many(notificationTopicPreference),
  roleRef: one(role, {
    fields: [user.role],
    references: [role.id],
  }),
  sessions: many(session),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const notificationTopicPreference = pgTable(
  "notification_topic_preference",
  {
    emailEnabled: boolean("email_enabled").default(true).notNull(),
    inboxEnabled: boolean("inbox_enabled").default(true).notNull(),
    topicId: text("topic_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    whatsappEnabled: boolean("whatsapp_enabled").default(true).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.topicId] })]
);

export const notificationTopicPreferenceRelations = relations(
  notificationTopicPreference,
  ({ one }) => ({
    user: one(user, {
      fields: [notificationTopicPreference.userId],
      references: [user.id],
    }),
  })
);
