import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import {
  kalakritiCenter,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiEdition,
} from "./kalakriti";

export const kalakritiResult = pgTable(
  "kalakriti_result",
  {
    id: uuid("id").primaryKey(),
    editionId: uuid("edition_id").notNull(),
    divisionId: uuid("division_id").notNull(),
    version: integer("version").notNull(),
    status: text("status").$type<"draft" | "published">().notNull(),
    winnerEntryId: uuid("winner_entry_id"),
    runnerUpEntryId: uuid("runner_up_entry_id"),
    scorecardIds: jsonb("scorecard_ids").$type<string[]>().notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("kalakriti_result_division_uq").on(t.divisionId),
    unique("kalakriti_result_edition_id_uq").on(t.editionId, t.id),
    foreignKey({
      columns: [t.editionId, t.divisionId],
      foreignColumns: [
        kalakritiCompetitionDivision.editionId,
        kalakritiCompetitionDivision.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.editionId, t.divisionId, t.winnerEntryId],
      foreignColumns: [
        kalakritiCompetitionEntry.editionId,
        kalakritiCompetitionEntry.divisionId,
        kalakritiCompetitionEntry.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.editionId, t.divisionId, t.runnerUpEntryId],
      foreignColumns: [
        kalakritiCompetitionEntry.editionId,
        kalakritiCompetitionEntry.divisionId,
        kalakritiCompetitionEntry.id,
      ],
    }).onDelete("restrict"),
    check(
      "kalakriti_result_status_chk",
      sql`${t.status} IN ('draft', 'published')`
    ),
    check(
      "kalakriti_result_distinct_chk",
      sql`${t.winnerEntryId} IS NULL OR ${t.runnerUpEntryId} IS NULL OR ${t.winnerEntryId} <> ${t.runnerUpEntryId}`
    ),
    check(
      "kalakriti_result_published_chk",
      sql`${t.status} <> 'published' OR (${t.winnerEntryId} IS NOT NULL AND ${t.runnerUpEntryId} IS NOT NULL AND jsonb_array_length(${t.scorecardIds}) > 0)`
    ),
    check("kalakriti_result_version_chk", sql`${t.version} > 0`),
  ]
);

export const kalakritiResultScorecard = pgTable(
  "kalakriti_result_scorecard",
  {
    id: uuid("id").primaryKey(),
    editionId: uuid("edition_id").notNull(),
    divisionId: uuid("division_id").notNull(),
    objectKey: text("object_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    uploadedAt: timestamp("uploaded_at").notNull(),
    uploadedBy: text("uploaded_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    foreignKey({
      columns: [t.editionId, t.divisionId],
      foreignColumns: [
        kalakritiCompetitionDivision.editionId,
        kalakritiCompetitionDivision.id,
      ],
    }).onDelete("restrict"),
    check(
      "kalakriti_scorecard_size_chk",
      sql`${t.byteSize} > 0 AND ${t.byteSize} <= 20971520`
    ),
    check(
      "kalakriti_scorecard_type_chk",
      sql`${t.mimeType} IN ('application/pdf', 'image/jpeg', 'image/png')`
    ),
  ]
);

export const kalakritiResultRevision = pgTable(
  "kalakriti_result_revision",
  {
    id: uuid("id").primaryKey(),
    editionId: uuid("edition_id").notNull(),
    resultId: uuid("result_id").notNull(),
    version: integer("version").notNull(),
    status: text("status").$type<"draft" | "published">().notNull(),
    winnerEntryId: uuid("winner_entry_id"),
    runnerUpEntryId: uuid("runner_up_entry_id"),
    scorecardIds: jsonb("scorecard_ids").$type<string[]>().notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("kalakriti_result_revision_version_uq").on(t.resultId, t.version),
    foreignKey({
      columns: [t.editionId, t.resultId],
      foreignColumns: [kalakritiResult.editionId, kalakritiResult.id],
    }).onDelete("restrict"),
  ]
);

export const kalakritiResultsState = pgTable(
  "kalakriti_results_state",
  {
    id: uuid("id").primaryKey(),
    editionId: uuid("edition_id")
      .notNull()
      .unique()
      .references(() => kalakritiEdition.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    winnerPoints: integer("winner_points"),
    runnerUpPoints: integer("runner_up_points"),
    finalizedAt: timestamp("finalized_at"),
    winnerCenterId: uuid("winner_center_id"),
    runnerUpCenterId: uuid("runner_up_center_id"),
    tieReason: text("tie_reason"),
  },
  (t) => [
    foreignKey({
      columns: [t.editionId, t.winnerCenterId],
      foreignColumns: [kalakritiCenter.editionId, kalakritiCenter.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.editionId, t.runnerUpCenterId],
      foreignColumns: [kalakritiCenter.editionId, kalakritiCenter.id],
    }).onDelete("restrict"),
    check(
      "kalakriti_results_final_chk",
      sql`${t.finalizedAt} IS NULL OR (${t.winnerCenterId} IS NOT NULL AND ${t.runnerUpCenterId} IS NOT NULL AND ${t.winnerCenterId} <> ${t.runnerUpCenterId})`
    ),
  ]
);

export const kalakritiStandingsRevision = pgTable(
  "kalakriti_standings_revision",
  {
    id: uuid("id").primaryKey(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => kalakritiEdition.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    action: text("action").$type<"finalized" | "reopened">().notNull(),
    winnerCenterId: uuid("winner_center_id"),
    runnerUpCenterId: uuid("runner_up_center_id"),
    winnerPoints: integer("winner_points").notNull(),
    runnerUpPoints: integer("runner_up_points").notNull(),
    tieReason: text("tie_reason"),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("kalakriti_standings_revision_version_uq").on(
      t.editionId,
      t.version
    ),
  ]
);
