import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const socialRunTickValues = ["hourly", "digest"] as const;
export type SocialRunTickValue = (typeof socialRunTickValues)[number];

/**
 * One run of the social-artifacts pipeline, reported through
 * `POST /api/social/v1/runs`. Read-only in Zero (Social page, Runs tab);
 * only the latest 500 rows are kept.
 */
export const socialRun = pgTable(
  "social_run",
  {
    createdAt: timestamp("created_at").notNull(),
    digestSent: boolean("digest_sent").notNull(),
    dropped: integer("dropped").notNull(),
    errors: jsonb("errors").$type<string[]>().default([]).notNull(),
    eventsSeen: integer("events_seen").notNull(),
    finishedAt: timestamp("finished_at").notNull(),
    id: uuid("id").primaryKey(),
    planned: integer("planned").notNull(),
    recorded: integer("recorded").notNull(),
    rendered: integer("rendered").notNull(),
    skipped: jsonb("skipped").$type<string[]>().default([]).notNull(),
    startedAt: timestamp("started_at").notNull(),
    tick: text("tick").$type<SocialRunTickValue>().notNull(),
  },
  (table) => [
    index("social_run_started_at_idx").on(table.startedAt.desc(), table.id),
    check("social_run_tick_chk", sql`tick IN ('hourly', 'digest')`),
  ]
);
