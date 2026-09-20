import type { AwardKind } from "@pi-dash/shared/kalakriti-awards";
import { sql } from "drizzle-orm";
import {
  boolean,
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
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiEdition,
  kalakritiStudent,
} from "./kalakriti";

export interface KalakritiAwardCommandPayload {
  divisionId: string;
  entryId: string;
  award: AwardKind;
  studentId?: string;
  awarded: boolean;
  expectedVersions: { studentId: string; version: number }[];
  now: number;
}

export const kalakritiAwardHandover = pgTable(
  "kalakriti_award_handover",
  {
    id: uuid("id").primaryKey(),
    editionId: uuid("edition_id").notNull(),
    divisionId: uuid("division_id").notNull(),
    entryId: uuid("entry_id").notNull(),
    studentId: uuid("student_id").notNull(),
    award: text("award").$type<AwardKind>().notNull(),
    awarded: boolean("awarded").notNull(),
    version: integer("version").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("kalakriti_award_handover_scope_uq").on(
      t.editionId,
      t.divisionId,
      t.entryId,
      t.studentId,
      t.award
    ),
    foreignKey({
      columns: [t.editionId, t.divisionId],
      foreignColumns: [
        kalakritiCompetitionDivision.editionId,
        kalakritiCompetitionDivision.id,
      ],
      name: "kalakriti_award_handover_division_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.editionId, t.divisionId, t.entryId],
      foreignColumns: [
        kalakritiCompetitionEntry.editionId,
        kalakritiCompetitionEntry.divisionId,
        kalakritiCompetitionEntry.id,
      ],
      name: "kalakriti_award_handover_entry_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.editionId, t.studentId],
      foreignColumns: [kalakritiStudent.editionId, kalakritiStudent.id],
      name: "kalakriti_award_handover_student_fk",
    }).onDelete("restrict"),
    check(
      "kalakriti_award_handover_award_chk",
      sql`${t.award} IN ('winner', 'runner_up')`
    ),
    check("kalakriti_award_handover_version_chk", sql`${t.version} > 0`),
  ]
);

export const kalakritiAwardCommand = pgTable("kalakriti_award_command", {
  id: uuid("id").primaryKey(),
  editionId: uuid("edition_id")
    .notNull()
    .references(() => kalakritiEdition.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull(),
  payload: jsonb("payload").$type<KalakritiAwardCommandPayload>().notNull(),
  createdAt: timestamp("created_at").notNull(),
});
