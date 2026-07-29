import { KALAKRITI_EDITION_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teamEvent } from "./team-event";

export const kalakritiEditionLifecycleEnum = pgEnum(
  "kalakriti_edition_lifecycle",
  ["draft", "registration_open", "registration_locked", "live", "archived"]
);

export const kalakritiMembershipKindEnum = pgEnum("kalakriti_membership_kind", [
  "volunteer",
  "guardian",
]);

export const kalakritiMembershipStateEnum = pgEnum(
  "kalakriti_membership_state",
  ["active", "archived"]
);

export const kalakritiResponsibilityEnum = pgEnum(
  "kalakriti_responsibility",
  KALAKRITI_EDITION_RESPONSIBILITIES
);

export const kalakritiEdition = pgTable(
  "kalakriti_edition",
  {
    ageCutoffDate: date("age_cutoff_date").notNull(),
    brandingKey: text("branding_key").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    eventDate: date("event_date").notNull(),
    id: uuid("id").primaryKey(),
    lifecycle: kalakritiEditionLifecycleEnum("lifecycle")
      .default("draft")
      .notNull(),
    name: text("name").notNull(),
    plannedRegistrationCloseAt: timestamp("planned_registration_close_at", {
      withTimezone: true,
    }).notNull(),
    runnerUpPoints: integer("runner_up_points").default(5).notNull(),
    teamEventId: uuid("team_event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "restrict" }),
    timezone: text("timezone").default("Asia/Kolkata").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    winnerPoints: integer("winner_points").default(10).notNull(),
    year: integer("year").notNull(),
  },
  (table) => [
    uniqueIndex("kalakriti_edition_year_uidx").on(table.year),
    uniqueIndex("kalakriti_edition_teamEventId_uidx").on(table.teamEventId),
    check(
      "kalakriti_edition_year_chk",
      sql`${table.year} BETWEEN 2000 AND 2200`
    ),
    check(
      "kalakriti_edition_points_chk",
      sql`${table.winnerPoints} >= 0 AND ${table.runnerUpPoints} >= 0`
    ),
  ]
);

export const kalakritiExternalIdentity = pgTable(
  "kalakriti_external_identity",
  {
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
  }
);

export const kalakritiEditionMembership = pgTable(
  "kalakriti_edition_membership",
  {
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => kalakritiEdition.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    kind: kalakritiMembershipKindEnum("kind").notNull(),
    snapshotEmail: text("snapshot_email"),
    snapshotName: text("snapshot_name").notNull(),
    snapshotPhone: text("snapshot_phone"),
    state: kalakritiMembershipStateEnum("state").default("active").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("kalakriti_membership_editionId_userId_uidx").on(
      table.editionId,
      table.userId
    ),
    unique("kalakriti_membership_editionId_id_uq").on(
      table.editionId,
      table.id
    ),
    index("kalakriti_membership_userId_idx").on(table.userId),
  ]
);

export const kalakritiAssignment = pgTable(
  "kalakriti_assignment",
  {
    centerId: uuid("center_id"),
    competitionCategoryId: uuid("competition_category_id"),
    competitionId: uuid("competition_id"),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => kalakritiEdition.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    membershipId: uuid("membership_id").notNull(),
    responsibility: kalakritiResponsibilityEnum("responsibility").notNull(),
  },
  (table) => [
    uniqueIndex("kalakriti_assignment_edition_scope_uidx")
      .on(table.membershipId, table.responsibility)
      .where(
        sql`${table.centerId} IS NULL AND ${table.competitionCategoryId} IS NULL AND ${table.competitionId} IS NULL`
      ),
    uniqueIndex("kalakriti_assignment_center_scope_uidx")
      .on(table.membershipId, table.responsibility, table.centerId)
      .where(sql`${table.centerId} IS NOT NULL`),
    uniqueIndex("kalakriti_assignment_category_scope_uidx")
      .on(table.membershipId, table.responsibility, table.competitionCategoryId)
      .where(sql`${table.competitionCategoryId} IS NOT NULL`),
    uniqueIndex("kalakriti_assignment_competition_scope_uidx")
      .on(table.membershipId, table.responsibility, table.competitionId)
      .where(sql`${table.competitionId} IS NOT NULL`),
    uniqueIndex("kalakriti_assignment_primary_uidx")
      .on(table.membershipId)
      .where(sql`${table.isPrimary} = true`),
    uniqueIndex("kalakriti_assignment_overall_events_lead_uidx")
      .on(table.editionId)
      .where(sql`${table.responsibility} = 'overall_events_lead'`),
    index("kalakriti_assignment_editionId_idx").on(table.editionId),
    foreignKey({
      columns: [table.editionId, table.membershipId],
      foreignColumns: [
        kalakritiEditionMembership.editionId,
        kalakritiEditionMembership.id,
      ],
      name: "kalakriti_assignment_edition_membership_fk",
    }).onDelete("cascade"),
    check(
      "kalakriti_assignment_scope_chk",
      sql`
        (${table.responsibility}::text IN ('edition_admin', 'volunteer_coordinator', 'overall_events_lead', 'food_lead', 'food_member', 'transport_lead', 'logistics_lead', 'logistics_member', 'awards_lead', 'awards_member', 'venue_lead', 'venue_member', 'hospitality_lead', 'hospitality_member', 'media_member', 'fundraising_member')
          AND ${table.centerId} IS NULL
          AND ${table.competitionCategoryId} IS NULL
          AND ${table.competitionId} IS NULL)
        OR (${table.responsibility}::text IN ('liaison', 'transport_coordinator')
          AND ${table.centerId} IS NOT NULL
          AND ${table.competitionCategoryId} IS NULL
          AND ${table.competitionId} IS NULL)
        OR (${table.responsibility}::text = 'competition_category_lead'
          AND ${table.centerId} IS NULL
          AND ${table.competitionCategoryId} IS NOT NULL
          AND ${table.competitionId} IS NULL)
        OR (${table.responsibility}::text IN ('competition_coordinator', 'competition_volunteer')
          AND ${table.centerId} IS NULL
          AND ${table.competitionCategoryId} IS NULL
          AND ${table.competitionId} IS NOT NULL)
      `
    ),
  ]
);

export const kalakritiAuditEntry = pgTable(
  "kalakriti_audit_entry",
  {
    action: text("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull(),
    domain: text("domain").notNull(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => kalakritiEdition.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    reason: text("reason"),
    targetId: text("target_id"),
    targetType: text("target_type").notNull(),
  },
  (table) => [
    index("kalakriti_audit_editionId_createdAt_idx").on(
      table.editionId,
      table.createdAt.desc()
    ),
  ]
);

export const kalakritiEditionRelations = relations(
  kalakritiEdition,
  ({ many, one }) => ({
    assignments: many(kalakritiAssignment),
    auditEntries: many(kalakritiAuditEntry),
    creator: one(user, {
      fields: [kalakritiEdition.createdBy],
      references: [user.id],
    }),
    memberships: many(kalakritiEditionMembership),
    teamEvent: one(teamEvent, {
      fields: [kalakritiEdition.teamEventId],
      references: [teamEvent.id],
    }),
  })
);

export const kalakritiEditionMembershipRelations = relations(
  kalakritiEditionMembership,
  ({ many, one }) => ({
    assignments: many(kalakritiAssignment),
    edition: one(kalakritiEdition, {
      fields: [kalakritiEditionMembership.editionId],
      references: [kalakritiEdition.id],
    }),
    user: one(user, {
      fields: [kalakritiEditionMembership.userId],
      references: [user.id],
    }),
  })
);

export const kalakritiAssignmentRelations = relations(
  kalakritiAssignment,
  ({ one }) => ({
    edition: one(kalakritiEdition, {
      fields: [kalakritiAssignment.editionId],
      references: [kalakritiEdition.id],
    }),
    membership: one(kalakritiEditionMembership, {
      fields: [kalakritiAssignment.membershipId],
      references: [kalakritiEditionMembership.id],
    }),
  })
);

export const kalakritiAuditEntryRelations = relations(
  kalakritiAuditEntry,
  ({ one }) => ({
    actor: one(user, {
      fields: [kalakritiAuditEntry.actorUserId],
      references: [user.id],
    }),
    edition: one(kalakritiEdition, {
      fields: [kalakritiAuditEntry.editionId],
      references: [kalakritiEdition.id],
    }),
  })
);
