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
    caption: text("caption"),
    createdAt: timestamp("created_at").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    immichAssetId: text("immich_asset_id"),
    mimeType: text("mime_type"),
    r2Key: text("r2_key"),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    status: eventPhotoStatusEnum("status").notNull().default("pending"),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
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
  reviewer: one(user, {
    fields: [eventPhoto.reviewedBy],
    references: [user.id],
    relationName: "photoReviewer",
  }),
  uploader: one(user, {
    fields: [eventPhoto.uploadedBy],
    references: [user.id],
    relationName: "photoUploader",
  }),
}));

export const eventImmichAlbum = pgTable(
  "event_immich_album",
  {
    createdAt: timestamp("created_at").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    immichAlbumId: text("immich_album_id").notNull(),
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
