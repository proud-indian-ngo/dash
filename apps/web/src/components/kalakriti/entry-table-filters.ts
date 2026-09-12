import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";

import {
  dateField,
  numberField,
  optionsFromRows,
  selectField,
} from "@/components/data-table/filter-fields";

import { getEntryStatusCounts } from "./entry-arrival";
import { entryAttendanceKey } from "./entry-arrival";
import type { KalakritiEntryRow } from "./entry-form-dialog";
const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "partial", label: "Partial" },
  { value: "none", label: "None" },
];
export function createEntryTableFilterFields(
  rows: readonly KalakritiEntryRow[],
  showCompetition: boolean,
  showMusic: boolean
): FilterField[] {
  return [
    selectField(
      "center",
      "Center",
      optionsFromRows(
        rows,
        (row) => row.center?.name,
        (row) => row.center?.name ?? "Unknown Center"
      )
    ),
    selectField("present", "Present", STATUS_OPTIONS),
    selectField("attended", "Attended", STATUS_OPTIONS),
    {
      id: "studentId",
      label: "Student IDs",
      type: "text",
      defaultOperator: "contains",
    },
    {
      id: "student",
      label: "Participants",
      type: "text",
      defaultOperator: "contains",
    },
    selectField("participationMode", "Participation", [
      { value: "individual", label: "Individual" },
      { value: "group", label: "Group" },
    ]),
    ...(showCompetition
      ? [
          selectField(
            "competition",
            "Competition",
            optionsFromRows(
              rows,
              (row) => row.session.competition.name,
              (row) => row.session.competition.name
            )
          ),
        ]
      : []),
    selectField(
      "ageCategory",
      "Age Category",
      optionsFromRows(
        rows,
        (row) => row.session.ageCategory.name,
        (row) => row.session.ageCategory.name
      )
    ),
    dateField("session", "Session"),
    selectField(
      "venue",
      "Venue",
      optionsFromRows(
        rows,
        (row) => row.session.venue.name,
        (row) => row.session.venue.name
      )
    ),
    ...(showMusic ? [numberField("music", "Music files")] : []),
  ];
}
export function getEntryTableFilterValue(
  row: KalakritiEntryRow,
  path: string[],
  present: ReadonlyMap<string, string> | undefined,
  attended: ReadonlyMap<string, string> | undefined
): unknown {
  switch (path[0]) {
    case "center":
      return row.center?.name ?? "Unknown Center";
    case "present":
      return getEntryStatusCounts(
        row.members.map((member) => member.studentId),
        present,
        "Present"
      ).category;
    case "attended":
      return getEntryStatusCounts(
        row.members.map((member) => entryAttendanceKey(row, member.studentId)),
        attended,
        "Attended"
      ).category;
    case "studentId":
      return row.members.map((member) => member.student.humanId).join(" ");
    case "student":
      return row.members.map((member) => member.student.name).join(" ");
    case "participationMode":
      return row.participationMode;
    case "competition":
      return row.session.competition.name;
    case "ageCategory":
      return row.session.ageCategory.name;
    case "session":
      return row.session.startAt;
    case "venue":
      return row.session.venue.name;
    case "music":
      return row.musicFiles.length;
    default:
      return undefined;
  }
}
