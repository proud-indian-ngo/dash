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

export const kalakritiParticipationModeEnum = pgEnum(
  "kalakriti_participation_mode",
  ["individual", "group"]
);

export const kalakritiGenderEligibilityEnum = pgEnum(
  "kalakriti_gender_eligibility",
  ["male", "female", "both"]
);

export const kalakritiStudentGenderEnum = pgEnum("kalakriti_student_gender", [
  "male",
  "female",
]);

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
    nextStudentSequence: integer("next_student_sequence").default(1).notNull(),
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
    uniqueIndex("kalakriti_edition_single_live_uidx")
      .on(table.lifecycle)
      .where(sql`${table.lifecycle} = 'live'`),
    check(
      "kalakriti_edition_year_chk",
      sql`${table.year} BETWEEN 2000 AND 2200`
    ),
    check(
      "kalakriti_edition_points_chk",
      sql`${table.winnerPoints} >= 0 AND ${table.runnerUpPoints} >= 0`
    ),
    check(
      "kalakriti_edition_nextStudentSequence_chk",
      sql`${table.nextStudentSequence} > 0`
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

export const kalakritiStudent = pgTable(
  "kalakriti_student",
  {
    ageCategoryId: uuid("age_category_id").notNull(),
    ageCategoryOverrideAt: timestamp("age_category_override_at"),
    ageCategoryOverrideBy: text("age_category_override_by").references(
      () => user.id
    ),
    ageCategoryOverrideReason: text("age_category_override_reason"),
    centerId: uuid("center_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    dateOfBirth: date("date_of_birth").notNull(),
    derivedAgeCategoryId: uuid("derived_age_category_id").notNull(),
    duplicateConfirmedAt: timestamp("duplicate_confirmed_at"),
    duplicateConfirmedBy: text("duplicate_confirmed_by").references(
      () => user.id
    ),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => kalakritiEdition.id, { onDelete: "cascade" }),
    gender: kalakritiStudentGenderEnum("gender").notNull(),
    humanId: text("human_id").notNull(),
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    uniqueIndex("kalakriti_student_humanId_uidx").on(table.humanId),
    unique("kalakriti_student_editionId_id_uq").on(table.editionId, table.id),
    unique("kalakriti_student_editionId_centerId_id_uq").on(
      table.editionId,
      table.centerId,
      table.id
    ),
    index("kalakriti_student_editionId_centerId_idx").on(
      table.editionId,
      table.centerId
    ),
    index("kalakriti_student_centerId_ageCategoryId_gender_idx").on(
      table.centerId,
      table.ageCategoryId,
      table.gender
    ),
    index("kalakriti_student_duplicate_lookup_idx").on(
      table.centerId,
      table.normalizedName,
      table.dateOfBirth
    ),
    foreignKey({
      columns: [table.editionId, table.centerId],
      foreignColumns: [kalakritiCenter.editionId, kalakritiCenter.id],
      name: "kalakriti_student_edition_center_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.editionId, table.derivedAgeCategoryId],
      foreignColumns: [kalakritiAgeCategory.editionId, kalakritiAgeCategory.id],
      name: "kalakriti_student_edition_derived_age_category_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.editionId, table.ageCategoryId],
      foreignColumns: [kalakritiAgeCategory.editionId, kalakritiAgeCategory.id],
      name: "kalakriti_student_edition_age_category_fk",
    }).onDelete("restrict"),
    check(
      "kalakriti_student_normalizedName_chk",
      sql`length(${table.normalizedName}) > 0`
    ),
    check(
      "kalakriti_student_age_category_override_chk",
      sql`(
        ${table.ageCategoryId} = ${table.derivedAgeCategoryId}
        AND ${table.ageCategoryOverrideAt} IS NULL
        AND ${table.ageCategoryOverrideBy} IS NULL
        AND ${table.ageCategoryOverrideReason} IS NULL
      ) OR (
        ${table.ageCategoryId} <> ${table.derivedAgeCategoryId}
        AND ${table.ageCategoryOverrideAt} IS NOT NULL
        AND ${table.ageCategoryOverrideBy} IS NOT NULL
        AND length(${table.ageCategoryOverrideReason}) > 0
      )`
    ),
    check(
      "kalakriti_student_duplicate_confirmation_chk",
      sql`(${table.duplicateConfirmedAt} IS NULL AND ${table.duplicateConfirmedBy} IS NULL)
        OR (${table.duplicateConfirmedAt} IS NOT NULL AND ${table.duplicateConfirmedBy} IS NOT NULL)`
    ),
  ]
);

export const kalakritiCredential = pgTable(
  "kalakriti_credential",
  {
    createdAt: timestamp("created_at").notNull(),
    editionId: uuid("edition_id").notNull(),
    humanId: text("human_id").notNull(),
    id: uuid("id").primaryKey(),
    issuedAt: timestamp("issued_at").notNull(),
    issuedBy: text("issued_by")
      .notNull()
      .references(() => user.id),
    revokedAt: timestamp("revoked_at"),
    revokedBy: text("revoked_by").references(() => user.id),
    studentId: uuid("student_id").notNull(),
    tokenHash: text("token_hash").notNull(),
  },
  (table) => [
    uniqueIndex("kalakriti_credential_tokenHash_uidx").on(table.tokenHash),
    uniqueIndex("kalakriti_credential_active_studentId_uidx")
      .on(table.studentId)
      .where(sql`${table.revokedAt} IS NULL`),
    index("kalakriti_credential_editionId_humanId_idx").on(
      table.editionId,
      table.humanId
    ),
    foreignKey({
      columns: [table.editionId, table.studentId],
      foreignColumns: [kalakritiStudent.editionId, kalakritiStudent.id],
      name: "kalakriti_credential_edition_student_fk",
    }).onDelete("cascade"),
    check(
      "kalakriti_credential_tokenHash_chk",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "kalakriti_credential_revocation_chk",
      sql`(${table.revokedAt} IS NULL AND ${table.revokedBy} IS NULL)
        OR (${table.revokedAt} IS NOT NULL AND ${table.revokedBy} IS NOT NULL)`
    ),
  ]
);

export const kalakritiCompetitionCategory = pgTable(
  "kalakriti_competition_category",
  {
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
    sortOrder: integer("sort_order").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex(
      "kalakriti_competition_category_editionId_normalizedName_uidx"
    ).on(table.editionId, table.normalizedName),
    uniqueIndex("kalakriti_competition_category_editionId_sortOrder_uidx").on(
      table.editionId,
      table.sortOrder
    ),
    unique("kalakriti_competition_category_editionId_id_uq").on(
      table.editionId,
      table.id
    ),
    index("kalakriti_competition_category_editionId_idx").on(table.editionId),
    check(
      "kalakriti_competition_category_sortOrder_chk",
      sql`${table.sortOrder} >= 0`
    ),
    check(
      "kalakriti_competition_category_normalizedName_chk",
      sql`length(${table.normalizedName}) > 0`
    ),
  ]
);

export const kalakritiCompetition = pgTable(
  "kalakriti_competition",
  {
    cancelledAt: timestamp("cancelled_at"),
    competitionCategoryId: uuid("competition_category_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    editionId: uuid("edition_id").notNull(),
    genderEligibility:
      kalakritiGenderEligibilityEnum("gender_eligibility").notNull(),
    id: uuid("id").primaryKey(),
    maximumGroupSize: integer("maximum_group_size").notNull(),
    minimumGroupSize: integer("minimum_group_size").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    participationMode:
      kalakritiParticipationModeEnum("participation_mode").notNull(),
    retiredAt: timestamp("retired_at"),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("kalakriti_competition_categoryId_normalizedName_uidx").on(
      table.competitionCategoryId,
      table.normalizedName
    ),
    unique("kalakriti_competition_editionId_id_uq").on(
      table.editionId,
      table.id
    ),
    index("kalakriti_competition_editionId_categoryId_idx").on(
      table.editionId,
      table.competitionCategoryId
    ),
    foreignKey({
      columns: [table.editionId, table.competitionCategoryId],
      foreignColumns: [
        kalakritiCompetitionCategory.editionId,
        kalakritiCompetitionCategory.id,
      ],
      name: "kalakriti_competition_edition_category_fk",
    }).onDelete("restrict"),
    check(
      "kalakriti_competition_group_size_chk",
      sql`(${table.participationMode} = 'individual' AND ${table.minimumGroupSize} = 1 AND ${table.maximumGroupSize} = 1)
        OR (${table.participationMode} = 'group' AND ${table.minimumGroupSize} >= 2 AND ${table.maximumGroupSize} >= ${table.minimumGroupSize})`
    ),
    check(
      "kalakriti_competition_normalizedName_chk",
      sql`length(${table.normalizedName}) > 0`
    ),
  ]
);

export const kalakritiVenue = pgTable(
  "kalakriti_venue",
  {
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
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("kalakriti_venue_editionId_normalizedName_uidx").on(
      table.editionId,
      table.normalizedName
    ),
    unique("kalakriti_venue_editionId_id_uq").on(table.editionId, table.id),
    index("kalakriti_venue_editionId_idx").on(table.editionId),
    check(
      "kalakriti_venue_normalizedName_chk",
      sql`length(${table.normalizedName}) > 0`
    ),
  ]
);

export const kalakritiCompetitionSession = pgTable(
  "kalakriti_competition_session",
  {
    ageCategoryId: uuid("age_category_id").notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    capacity: integer("capacity").notNull(),
    competitionId: uuid("competition_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    editionId: uuid("edition_id").notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    id: uuid("id").primaryKey(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    venueId: uuid("venue_id").notNull(),
  },
  (table) => [
    uniqueIndex(
      "kalakriti_competition_session_competitionId_ageCategoryId_uidx"
    ).on(table.competitionId, table.ageCategoryId),
    unique("kalakriti_competition_session_editionId_id_uq").on(
      table.editionId,
      table.id
    ),
    index("kalakriti_competition_session_editionId_startAt_idx").on(
      table.editionId,
      table.startAt
    ),
    index("kalakriti_competition_session_venueId_startAt_idx").on(
      table.venueId,
      table.startAt
    ),
    foreignKey({
      columns: [table.editionId, table.competitionId],
      foreignColumns: [kalakritiCompetition.editionId, kalakritiCompetition.id],
      name: "kalakriti_competition_session_edition_competition_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.editionId, table.ageCategoryId],
      foreignColumns: [kalakritiAgeCategory.editionId, kalakritiAgeCategory.id],
      name: "kalakriti_competition_session_edition_age_category_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.editionId, table.venueId],
      foreignColumns: [kalakritiVenue.editionId, kalakritiVenue.id],
      name: "kalakriti_competition_session_edition_venue_fk",
    }).onDelete("restrict"),
    check(
      "kalakriti_competition_session_capacity_chk",
      sql`${table.capacity} > 0`
    ),
    check(
      "kalakriti_competition_session_time_range_chk",
      sql`${table.endAt} > ${table.startAt}`
    ),
  ]
);

export const kalakritiCompetitionEntry = pgTable(
  "kalakriti_competition_entry",
  {
    centerId: uuid("center_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    editionId: uuid("edition_id").notNull(),
    id: uuid("id").primaryKey(),
    participationMode:
      kalakritiParticipationModeEnum("participation_mode").notNull(),
    sessionId: uuid("session_id").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    unique("kalakriti_competition_entry_edition_center_session_id_uq").on(
      table.editionId,
      table.centerId,
      table.sessionId,
      table.id
    ),
    index("kalakriti_competition_entry_editionId_centerId_idx").on(
      table.editionId,
      table.centerId
    ),
    index("kalakriti_competition_entry_sessionId_idx").on(table.sessionId),
    foreignKey({
      columns: [table.editionId, table.centerId],
      foreignColumns: [kalakritiCenter.editionId, kalakritiCenter.id],
      name: "kalakriti_competition_entry_edition_center_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.editionId, table.sessionId],
      foreignColumns: [
        kalakritiCompetitionSession.editionId,
        kalakritiCompetitionSession.id,
      ],
      name: "kalakriti_competition_entry_edition_session_fk",
    }).onDelete("restrict"),
  ]
);

export const kalakritiEntryMember = pgTable(
  "kalakriti_entry_member",
  {
    centerId: uuid("center_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    editionId: uuid("edition_id").notNull(),
    entryId: uuid("entry_id").notNull(),
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id").notNull(),
    studentId: uuid("student_id").notNull(),
  },
  (table) => [
    uniqueIndex("kalakriti_entry_member_entryId_studentId_uidx").on(
      table.entryId,
      table.studentId
    ),
    uniqueIndex("kalakriti_entry_member_sessionId_studentId_uidx").on(
      table.sessionId,
      table.studentId
    ),
    index("kalakriti_entry_member_editionId_centerId_idx").on(
      table.editionId,
      table.centerId
    ),
    index("kalakriti_entry_member_studentId_idx").on(table.studentId),
    foreignKey({
      columns: [
        table.editionId,
        table.centerId,
        table.sessionId,
        table.entryId,
      ],
      foreignColumns: [
        kalakritiCompetitionEntry.editionId,
        kalakritiCompetitionEntry.centerId,
        kalakritiCompetitionEntry.sessionId,
        kalakritiCompetitionEntry.id,
      ],
      name: "kalakriti_entry_member_entry_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.editionId, table.centerId, table.studentId],
      foreignColumns: [
        kalakritiStudent.editionId,
        kalakritiStudent.centerId,
        kalakritiStudent.id,
      ],
      name: "kalakriti_entry_member_student_scope_fk",
    }).onDelete("restrict"),
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
    foreignKey({
      columns: [table.editionId, table.competitionCategoryId],
      foreignColumns: [
        kalakritiCompetitionCategory.editionId,
        kalakritiCompetitionCategory.id,
      ],
      name: "kalakriti_assignment_edition_competition_category_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.editionId, table.competitionId],
      foreignColumns: [kalakritiCompetition.editionId, kalakritiCompetition.id],
      name: "kalakriti_assignment_edition_competition_fk",
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
    actorUserId: text("actor_user_id"),
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
    competitionCategories: many(kalakritiCompetitionCategory),
    competitionEntries: many(kalakritiCompetitionEntry),
    competitionSessions: many(kalakritiCompetitionSession),
    competitions: many(kalakritiCompetition),
    creator: one(user, {
      fields: [kalakritiEdition.createdBy],
      references: [user.id],
    }),
    memberships: many(kalakritiEditionMembership),
    students: many(kalakritiStudent),
    teamEvent: one(teamEvent, {
      fields: [kalakritiEdition.teamEventId],
      references: [teamEvent.id],
    }),
    venues: many(kalakritiVenue),
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
    competition: one(kalakritiCompetition, {
      fields: [kalakritiAssignment.competitionId],
      references: [kalakritiCompetition.id],
    }),
    competitionCategory: one(kalakritiCompetitionCategory, {
      fields: [kalakritiAssignment.competitionCategoryId],
      references: [kalakritiCompetitionCategory.id],
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
    competitionEntries: many(kalakritiCompetitionEntry),
    edition: one(kalakritiEdition, {
      fields: [kalakritiCenter.editionId],
      references: [kalakritiEdition.id],
    }),
    guardianCenters: many(kalakritiGuardianCenter),
    quotas: many(kalakritiCenterAgeQuota),
    students: many(kalakritiStudent),
  })
);

export const kalakritiAgeCategoryRelations = relations(
  kalakritiAgeCategory,
  ({ many, one }) => ({
    derivedStudents: many(kalakritiStudent, {
      relationName: "kalakriti_student_derived_age_category",
    }),
    edition: one(kalakritiEdition, {
      fields: [kalakritiAgeCategory.editionId],
      references: [kalakritiEdition.id],
    }),
    quotas: many(kalakritiCenterAgeQuota),
    sessions: many(kalakritiCompetitionSession),
    students: many(kalakritiStudent, {
      relationName: "kalakriti_student_age_category",
    }),
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

export const kalakritiStudentRelations = relations(
  kalakritiStudent,
  ({ many, one }) => ({
    ageCategory: one(kalakritiAgeCategory, {
      fields: [kalakritiStudent.ageCategoryId],
      references: [kalakritiAgeCategory.id],
      relationName: "kalakriti_student_age_category",
    }),
    center: one(kalakritiCenter, {
      fields: [kalakritiStudent.centerId],
      references: [kalakritiCenter.id],
    }),
    credentials: many(kalakritiCredential),
    derivedAgeCategory: one(kalakritiAgeCategory, {
      fields: [kalakritiStudent.derivedAgeCategoryId],
      references: [kalakritiAgeCategory.id],
      relationName: "kalakriti_student_derived_age_category",
    }),
    edition: one(kalakritiEdition, {
      fields: [kalakritiStudent.editionId],
      references: [kalakritiEdition.id],
    }),
    entryMemberships: many(kalakritiEntryMember),
  })
);

export const kalakritiCredentialRelations = relations(
  kalakritiCredential,
  ({ one }) => ({
    student: one(kalakritiStudent, {
      fields: [kalakritiCredential.studentId],
      references: [kalakritiStudent.id],
    }),
  })
);

export const kalakritiCompetitionCategoryRelations = relations(
  kalakritiCompetitionCategory,
  ({ many, one }) => ({
    assignments: many(kalakritiAssignment),
    competitions: many(kalakritiCompetition),
    edition: one(kalakritiEdition, {
      fields: [kalakritiCompetitionCategory.editionId],
      references: [kalakritiEdition.id],
    }),
  })
);

export const kalakritiCompetitionRelations = relations(
  kalakritiCompetition,
  ({ many, one }) => ({
    assignments: many(kalakritiAssignment),
    category: one(kalakritiCompetitionCategory, {
      fields: [kalakritiCompetition.competitionCategoryId],
      references: [kalakritiCompetitionCategory.id],
    }),
    edition: one(kalakritiEdition, {
      fields: [kalakritiCompetition.editionId],
      references: [kalakritiEdition.id],
    }),
    sessions: many(kalakritiCompetitionSession),
  })
);

export const kalakritiVenueRelations = relations(
  kalakritiVenue,
  ({ many, one }) => ({
    edition: one(kalakritiEdition, {
      fields: [kalakritiVenue.editionId],
      references: [kalakritiEdition.id],
    }),
    sessions: many(kalakritiCompetitionSession),
  })
);

export const kalakritiCompetitionSessionRelations = relations(
  kalakritiCompetitionSession,
  ({ many, one }) => ({
    ageCategory: one(kalakritiAgeCategory, {
      fields: [kalakritiCompetitionSession.ageCategoryId],
      references: [kalakritiAgeCategory.id],
    }),
    competition: one(kalakritiCompetition, {
      fields: [kalakritiCompetitionSession.competitionId],
      references: [kalakritiCompetition.id],
    }),
    edition: one(kalakritiEdition, {
      fields: [kalakritiCompetitionSession.editionId],
      references: [kalakritiEdition.id],
    }),
    entries: many(kalakritiCompetitionEntry),
    venue: one(kalakritiVenue, {
      fields: [kalakritiCompetitionSession.venueId],
      references: [kalakritiVenue.id],
    }),
  })
);

export const kalakritiCompetitionEntryRelations = relations(
  kalakritiCompetitionEntry,
  ({ many, one }) => ({
    center: one(kalakritiCenter, {
      fields: [kalakritiCompetitionEntry.centerId],
      references: [kalakritiCenter.id],
    }),
    edition: one(kalakritiEdition, {
      fields: [kalakritiCompetitionEntry.editionId],
      references: [kalakritiEdition.id],
    }),
    members: many(kalakritiEntryMember),
    session: one(kalakritiCompetitionSession, {
      fields: [kalakritiCompetitionEntry.sessionId],
      references: [kalakritiCompetitionSession.id],
    }),
  })
);

export const kalakritiEntryMemberRelations = relations(
  kalakritiEntryMember,
  ({ one }) => ({
    entry: one(kalakritiCompetitionEntry, {
      fields: [kalakritiEntryMember.entryId],
      references: [kalakritiCompetitionEntry.id],
    }),
    student: one(kalakritiStudent, {
      fields: [kalakritiEntryMember.studentId],
      references: [kalakritiStudent.id],
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
