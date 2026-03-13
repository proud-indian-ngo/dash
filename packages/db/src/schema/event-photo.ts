import { relations } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teamEvent } from "./team-event";

export const eventPhotoStatusEnum = pgEnum("event_photo_status", [
  "pending",
  "approved",
  "rejected",
]);

export const eventPhoto = pgTable(
  "event_photo",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    r2Key: text("r2_key"),
    immichAssetId: text("immich_asset_id"),
    caption: text("caption"),
    status: eventPhotoStatusEnum("status").notNull().default("pending"),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("event_photo_eventId_idx").on(table.eventId),
    index("event_photo_uploadedBy_idx").on(table.uploadedBy),
  ]
);

export const eventPhotoRelations = relations(eventPhoto, ({ one }) => ({
  event: one(teamEvent, {
    fields: [eventPhoto.eventId],
    references: [teamEvent.id],
  }),
  uploader: one(user, {
    fields: [eventPhoto.uploadedBy],
    references: [user.id],
    relationName: "photoUploader",
  }),
  reviewer: one(user, {
    fields: [eventPhoto.reviewedBy],
    references: [user.id],
    relationName: "photoReviewer",
  }),
}));

export const eventImmichAlbum = pgTable(
  "event_immich_album",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    immichAlbumId: text("immich_album_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("event_immich_album_eventId_uidx").on(table.eventId)]
);

export const eventImmichAlbumRelations = relations(
  eventImmichAlbum,
  ({ one }) => ({
    event: one(teamEvent, {
      fields: [eventImmichAlbum.eventId],
      references: [teamEvent.id],
    }),
  })
);
