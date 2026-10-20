import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const socialPostChannelValues = ["instagram", "linkedin"] as const;
export const socialPostKindValues = [
  "schedule",
  "recap",
  "volunteer-call",
  "impact",
  "story",
] as const;
export const socialPostStatusValues = [
  "queued",
  "approved",
  "published",
  "failed",
  "dropped",
] as const;

export type SocialPostChannel = (typeof socialPostChannelValues)[number];
export type SocialPostKind = (typeof socialPostKindValues)[number];
export type SocialPostStatus = (typeof socialPostStatusValues)[number];

/**
 * What the social pipeline queued for an event, recorded through
 * `POST /api/social/v1/posted`. `event_id` is the social API event id as the
 * generator sent it (a row id, `${seriesId}:${occDate}` for a virtual
 * occurrence, or a synthetic id for schedule and impact posts), so it is not
 * a foreign key. `occurrence_date` (YYYY-MM-DD) and `event_name` are set for
 * event posts only. `held` is true when the post was created as a Buffer
 * draft for approval, false when it was scheduled automatically, and null
 * when the pipeline did not say. `dropped_by` / `dropped_at` are set when someone drops
 * the post on the Social page (`socialPost.drop`); the pipeline treats
 * `dropped` as final. `failed` means Buffer could not publish the post, and
 * `error` holds Buffer's message for it.
 */
export const socialPost = pgTable(
  "social_post",
  {
    bufferPostId: text("buffer_post_id").notNull(),
    channel: text("channel").$type<SocialPostChannel>().notNull(),
    createdAt: timestamp("created_at").notNull(),
    droppedAt: timestamp("dropped_at"),
    droppedBy: text("dropped_by").references(() => user.id, {
      onDelete: "set null",
    }),
    error: text("error"),
    eventId: text("event_id").notNull(),
    eventName: text("event_name"),
    held: boolean("held"),
    id: uuid("id").primaryKey(),
    kind: text("kind").$type<SocialPostKind>().notNull(),
    occurrenceDate: text("occurrence_date"),
    scheduledFor: timestamp("scheduled_for").notNull(),
    status: text("status").$type<SocialPostStatus>().notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("social_post_event_channel_kind_buffer_uidx").on(
      table.eventId,
      table.channel,
      table.kind,
      table.bufferPostId
    ),
    index("social_post_occurrence_date_idx").on(table.occurrenceDate),
    index("social_post_scheduled_for_idx").on(
      table.scheduledFor.desc(),
      table.id
    ),
    check("social_post_channel_chk", sql`channel IN ('instagram', 'linkedin')`),
    check(
      "social_post_kind_chk",
      sql`kind IN ('schedule', 'recap', 'volunteer-call', 'impact', 'story')`
    ),
    check(
      "social_post_status_chk",
      sql`status IN ('queued', 'approved', 'published', 'failed', 'dropped')`
    ),
  ]
);
