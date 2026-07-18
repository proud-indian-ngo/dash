import { z } from "zod";
import type { CsvFile } from "@/lib/csv-export";

export const kalakritiRegistrationExportInputSchema = z.strictObject({
  year: z.number().int().min(2000).max(2200),
});

export interface KalakritiRegistrationExportStudentRow {
  ageCategory: string;
  center: string;
  dateOfBirth: string;
  gender: string;
  name: string;
  studentId: string;
}

export interface KalakritiRegistrationExportEntryRow {
  ageCategory: string;
  center: string;
  competition: string;
  competitionCategory: string;
  endAt: string;
  entryId: string;
  participantIds: string[];
  participantNames: string[];
  participationMode: string;
  startAt: string;
  venue: string;
}

export interface KalakritiRegistrationExportData {
  entries: KalakritiRegistrationExportEntryRow[];
  students: KalakritiRegistrationExportStudentRow[];
}

export function buildKalakritiRegistrationCsvFiles(
  year: number,
  data: KalakritiRegistrationExportData
): CsvFile[] {
  return [
    {
      filename: `kalakriti-${year}-students.csv`,
      headers: [
        "Student ID",
        "Name",
        "Date of Birth",
        "Gender",
        "Center",
        "Age Category",
      ],
      rows: data.students.map((student) => [
        student.studentId,
        student.name,
        student.dateOfBirth,
        student.gender,
        student.center,
        student.ageCategory,
      ]),
    },
    {
      filename: `kalakriti-${year}-competition-entries.csv`,
      headers: [
        "Entry ID",
        "Competition Category",
        "Competition",
        "Age Category",
        "Center",
        "Participation Mode",
        "Student IDs",
        "Student Names",
        "Starts At",
        "Ends At",
        "Venue",
      ],
      rows: data.entries.map((entry) => [
        entry.entryId,
        entry.competitionCategory,
        entry.competition,
        entry.ageCategory,
        entry.center,
        entry.participationMode,
        entry.participantIds.join("; "),
        entry.participantNames.join("; "),
        entry.startAt,
        entry.endAt,
        entry.venue,
      ]),
    },
  ];
}
