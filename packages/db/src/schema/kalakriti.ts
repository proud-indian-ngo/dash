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
    uniqueIndex("kalakriti_membership_active_guardian_userId_uidx")
      .on(table.userId)
      .where(
        sql`${table.kind} = 'guardian' AND ${table.state} = 'active' AND ${table.userId} IS NOT NULL`
      ),
    unique("kalakriti_membership_editionId_id_uq").on(
      table.editionId,
      table.id
    ),
    index("kalakriti_membership_userId_idx").on(table.userId),
  ]
);

export const kalakritiCenter = pgTable(
  "kalakriti_center",
  {
    competitionEntryRegistrationEnabled: boolean(
      "competition_entry_registration_enabled"
    )
      .default(false)
      .notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => kalakritiEdition.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    retiredAt: timestamp("retired_at"),
    studentRegistrationEnabled: boolean("student_registration_enabled")
      .default(false)
      .notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("kalakriti_center_editionId_normalizedName_uidx").on(
      table.editionId,
      table.normalizedName
    ),
    unique("kalakriti_center_editionId_id_uq").on(table.editionId, table.id),
    index("kalakriti_center_editionId_idx").on(table.editionId),
    check(
      "kalakriti_center_normalizedName_chk",
      sql`length(${table.normalizedName}) > 0`
    ),
  ]
);

export const kalakritiAgeCategory = pgTable(
  "kalakriti_age_category",
  {
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => kalakritiEdition.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    maxCompetitionsPerCategory: integer(
      "max_competitions_per_category"
    ).notNull(),
    maximumAge: integer("maximum_age").notNull(),
    maxTotalCompetitions: integer("max_total_competitions").notNull(),
    minimumAge: integer("minimum_age").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("kalakriti_age_category_editionId_normalizedName_uidx").on(
      table.editionId,
      table.normalizedName
    ),
    uniqueIndex("kalakriti_age_category_editionId_sortOrder_uidx").on(
      table.editionId,
      table.sortOrder
    ),
    unique("kalakriti_age_category_editionId_id_uq").on(
      table.editionId,
      table.id
    ),
    index("kalakriti_age_category_editionId_idx").on(table.editionId),
    check(
      "kalakriti_age_category_age_range_chk",
      sql`${table.minimumAge} BETWEEN 0 AND 100 AND ${table.maximumAge} BETWEEN ${table.minimumAge} AND 100`
    ),
    check(
      "kalakriti_age_category_competition_limits_chk",
      sql`${table.maxTotalCompetitions} > 0 AND ${table.maxCompetitionsPerCategory} > 0 AND ${table.maxCompetitionsPerCategory} <= ${table.maxTotalCompetitions}`
    ),
    check("kalakriti_age_category_sortOrder_chk", sql`${table.sortOrder} >= 0`),
    check(
      "kalakriti_age_category_normalizedName_chk",
      sql`length(${table.normalizedName}) > 0`
    ),
  ]
);

export const kalakritiCenterAgeQuota = pgTable(
  "kalakriti_center_age_quota",
  {
    ageCategoryId: uuid("age_category_id").notNull(),
    centerId: uuid("center_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    editionId: uuid("edition_id").notNull(),
    femaleStudentLimit: integer("female_student_limit").notNull(),
    id: uuid("id").primaryKey(),
    maleStudentLimit: integer("male_student_limit").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("kalakriti_center_age_quota_centerId_ageCategoryId_uidx").on(
      table.centerId,
      table.ageCategoryId
    ),
    index("kalakriti_center_age_quota_editionId_idx").on(table.editionId),
    foreignKey({
      columns: [table.editionId, table.centerId],
      foreignColumns: [kalakritiCenter.editionId, kalakritiCenter.id],
      name: "kalakriti_center_age_quota_edition_center_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.editionId, table.ageCategoryId],
      foreignColumns: [kalakritiAgeCategory.editionId, kalakritiAgeCategory.id],
      name: "kalakriti_center_age_quota_edition_age_category_fk",
    }).onDelete("restrict"),
    check(
      "kalakriti_center_age_quota_limits_chk",
      sql`${table.maleStudentLimit} >= 0 AND ${table.femaleStudentLimit} >= 0`
    ),
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
    foreignKey({
      columns: [table.editionId, table.centerId],
      foreignColumns: [kalakritiCenter.editionId, kalakritiCenter.id],
      name: "kalakriti_assignment_edition_center_fk",
    }).onDelete("restrict"),
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

export const kalakritiGuardianCenter = pgTable(
  "kalakriti_guardian_center",
  {
    centerId: uuid("center_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => kalakritiEdition.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    membershipId: uuid("membership_id").notNull(),
  },
  (table) => [
    uniqueIndex("kalakriti_guardian_center_membershipId_centerId_uidx").on(
      table.membershipId,
      table.centerId
    ),
    index("kalakriti_guardian_center_editionId_centerId_idx").on(
      table.editionId,
      table.centerId
    ),
    foreignKey({
      columns: [table.editionId, table.membershipId],
      foreignColumns: [
        kalakritiEditionMembership.editionId,
        kalakritiEditionMembership.id,
      ],
      name: "kalakriti_guardian_center_edition_membership_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.editionId, table.centerId],
      foreignColumns: [kalakritiCenter.editionId, kalakritiCenter.id],
      name: "kalakriti_guardian_center_edition_center_fk",
    }).onDelete("restrict"),
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
    ageCategories: many(kalakritiAgeCategory),
    assignments: many(kalakritiAssignment),
    auditEntries: many(kalakritiAuditEntry),
    centers: many(kalakritiCenter),
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
    guardianCenters: many(kalakritiGuardianCenter),
    user: one(user, {
      fields: [kalakritiEditionMembership.userId],
      references: [user.id],
    }),
  })
);

export const kalakritiAssignmentRelations = relations(
  kalakritiAssignment,
  ({ one }) => ({
    center: one(kalakritiCenter, {
      fields: [kalakritiAssignment.centerId],
      references: [kalakritiCenter.id],
    }),
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

export const kalakritiCenterRelations = relations(
  kalakritiCenter,
  ({ many, one }) => ({
    assignments: many(kalakritiAssignment),
    edition: one(kalakritiEdition, {
      fields: [kalakritiCenter.editionId],
      references: [kalakritiEdition.id],
    }),
    guardianCenters: many(kalakritiGuardianCenter),
    quotas: many(kalakritiCenterAgeQuota),
  })
);

export const kalakritiAgeCategoryRelations = relations(
  kalakritiAgeCategory,
  ({ many, one }) => ({
    edition: one(kalakritiEdition, {
      fields: [kalakritiAgeCategory.editionId],
      references: [kalakritiEdition.id],
    }),
    quotas: many(kalakritiCenterAgeQuota),
  })
);

export const kalakritiCenterAgeQuotaRelations = relations(
  kalakritiCenterAgeQuota,
  ({ one }) => ({
    ageCategory: one(kalakritiAgeCategory, {
      fields: [kalakritiCenterAgeQuota.ageCategoryId],
      references: [kalakritiAgeCategory.id],
    }),
    center: one(kalakritiCenter, {
      fields: [kalakritiCenterAgeQuota.centerId],
      references: [kalakritiCenter.id],
    }),
    edition: one(kalakritiEdition, {
      fields: [kalakritiCenterAgeQuota.editionId],
      references: [kalakritiEdition.id],
    }),
  })
);

export const kalakritiGuardianCenterRelations = relations(
  kalakritiGuardianCenter,
  ({ one }) => ({
    center: one(kalakritiCenter, {
      fields: [kalakritiGuardianCenter.centerId],
      references: [kalakritiCenter.id],
    }),
    edition: one(kalakritiEdition, {
      fields: [kalakritiGuardianCenter.editionId],
      references: [kalakritiEdition.id],
    }),
    membership: one(kalakritiEditionMembership, {
      fields: [kalakritiGuardianCenter.membershipId],
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
