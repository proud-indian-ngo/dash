import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user, userGenderEnum } from "./auth";
import { center } from "./center";
import { cityEnum } from "./shared";
import { attendanceStatusEnum, teamEvent } from "./team-event";

export const student = pgTable(
  "student",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "date" }),
    gender: userGenderEnum("gender"),
    centerId: uuid("center_id").references(() => center.id, {
      onDelete: "cascade",
    }),
    city: cityEnum("city").notNull().default("bangalore"),
    notes: text("notes"),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("student_centerId_idx").on(table.centerId),
    index("student_city_idx").on(table.city),
  ]
);

export const classEventStudent = pgTable(
  "class_event_student",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    attendance: attendanceStatusEnum("attendance"),
    attendanceMarkedAt: timestamp("attendance_marked_at"),
    attendanceMarkedBy: text("attendance_marked_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("class_event_student_eventId_studentId_uidx").on(
      table.eventId,
      table.studentId
    ),
    index("class_event_student_eventId_idx").on(table.eventId),
    index("class_event_student_studentId_idx").on(table.studentId),
  ]
);

export const studentRelations = relations(student, ({ one, many }) => ({
  center: one(center, {
    fields: [student.centerId],
    references: [center.id],
  }),
  creator: one(user, {
    fields: [student.createdBy],
    references: [user.id],
  }),
  classEvents: many(classEventStudent),
}));

export const classEventStudentRelations = relations(
  classEventStudent,
  ({ one }) => ({
    event: one(teamEvent, {
      fields: [classEventStudent.eventId],
      references: [teamEvent.id],
    }),
    student: one(student, {
      fields: [classEventStudent.studentId],
      references: [student.id],
    }),
  })
);
