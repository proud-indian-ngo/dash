import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const socialApiScopeValues = [
  "events:read",
  "photos:read",
  "signups:read",
  "social:write",
] as const;
export type SocialApiScope = (typeof socialApiScopeValues)[number];

/**
 * Bearer tokens for the machine-facing social API (`/api/social/v1/*`).
 * Only the sha256 hex of the raw token is stored; `bun run social:token`
 * prints the raw value once. Deliberately left out of the schema barrel so
 * the table never enters the generated Zero schema.
 */
export const socialApiToken = pgTable("social_api_token", {
  createdAt: timestamp("created_at").notNull(),
  id: uuid("id").primaryKey(),
  lastUsedAt: timestamp("last_used_at"),
  name: text("name").notNull(),
  revokedAt: timestamp("revoked_at"),
  scopes: text("scopes").array().$type<SocialApiScope[]>().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
});
