import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { teamEvent } from "./team-event";

/**
 * Partner organisation credited on an event's social posts. A series parent's
 * partners apply to every virtual occurrence; an exception row uses its own
 * partners when it has any, otherwise the parent's.
 */
export const eventPartner = pgTable(
  "event_partner",
  {
    createdAt: timestamp("created_at").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    /** Instagram handle, e.g. `@nss_sfs`. */
    instagram: text("instagram"),
    /** LinkedIn organisation slug or URN. */
    linkedin: text("linkedin"),
    name: text("name").notNull(),
  },
  (table) => [index("event_partner_eventId_idx").on(table.eventId)]
);

export const eventPartnerRelations = relations(eventPartner, ({ one }) => ({
  event: one(teamEvent, {
    fields: [eventPartner.eventId],
    references: [teamEvent.id],
  }),
}));
