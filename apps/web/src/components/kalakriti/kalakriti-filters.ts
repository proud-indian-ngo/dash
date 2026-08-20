import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { KALAKRITI_RESPONSIBILITY_LABELS } from "@pi-dash/shared/kalakriti";
import {
  dateField,
  numberField,
  optionsFromRows,
  selectField,
} from "@/components/data-table/filter-fields";
import type { CenterTableRow } from "@/components/kalakriti/centers-table";
import type { CompetitionCategoryTableRow } from "@/components/kalakriti/competition-config-types";
import {
  type CompetitionTableRow,
  getCompetitionStatus,
  type ScheduleTableRow,
  type VenueTableRow,
} from "@/components/kalakriti/competition-config-types";
import type { EntrySessionRow } from "@/components/kalakriti/entry-sessions-table";
import type { GuardianRosterItem } from "@/components/kalakriti/guardians-table";
import type { KalakritiStudentRow } from "@/components/kalakriti/student-form-dialog";
import type { VolunteerRosterItem } from "@/components/kalakriti/volunteers-table";
import {
  KALAKRITI_GENDER_ELIGIBILITY_LABELS,
  type KalakritiGenderEligibility,
} from "@/lib/kalakriti-competition-labels";

const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];
const RETIRED_STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Retired", value: "retired" },
];
const OPEN_CLOSED_OPTIONS = [
  { label: "Open", value: "open" },
  { label: "Closed", value: "closed" },
];
const PRIMARY_ROLE_OPTIONS = [
  { label: "Primary", value: "primary" },
  { label: "Not primary", value: "secondary" },
];
const GUARDIAN_STATE_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
];
const COMPETITION_STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Retired", value: "retired" },
];
const PARTICIPATION_MODE_OPTIONS = [
  { label: "Individual", value: "individual" },
  { label: "Group", value: "group" },
];
const SESSION_STATUS_OPTIONS = [
  { label: "Scheduled", value: "scheduled" },
  { label: "Cancelled", value: "cancelled" },
];
const GENDER_ELIGIBILITY_OPTIONS = (
  Object.entries(KALAKRITI_GENDER_ELIGIBILITY_LABELS) as [
    KalakritiGenderEligibility,
    string,
  ][]
).map(([value, label]) => ({ label, value }));

function retiredStatus(retiredAt: number | null): "active" | "retired" {
  return retiredAt === null ? "active" : "retired";
}

function openClosed(enabled: boolean): "open" | "closed" {
  return enabled ? "open" : "closed";
}

export function getStudentFilterValue(
  row: KalakritiStudentRow,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "ageCategory":
      return row.ageCategoryId;
    case "dateOfBirth":
      return row.dateOfBirth;
    case "gender":
      return row.gender;
    default:
      return;
  }
}

export function createStudentFilterFields(
  rows: readonly KalakritiStudentRow[]
): FilterField[] {
  return [
    selectField("gender", "Gender", GENDER_OPTIONS),
    selectField(
      "ageCategory",
      "Age Category",
      optionsFromRows(
        rows,
        (row) => row.ageCategoryId,
        (row) => row.ageCategory?.name ?? row.ageCategoryId
      )
    ),
    dateField("dateOfBirth", "Date of birth"),
  ];
}

export function getEntrySessionFilterValue(
  row: EntrySessionRow,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "ageCategoryName":
      return row.ageCategoryName;
    case "categoryName":
      return row.categoryName;
    case "competitionName":
      return row.competitionName;
    case "endAt":
      return row.endAt;
    case "entryCount":
      return row.entryCount;
    case "genderEligibility":
      return row.genderEligibility;
    case "startAt":
      return row.startAt;
    case "venueName":
      return row.venueName;
    default:
      return;
  }
}

export function createEntrySessionFilterFields(
  rows: readonly EntrySessionRow[]
): FilterField[] {
  return [
    selectField(
      "competitionName",
      "Event",
      optionsFromRows(
        rows,
        (row) => row.competitionName,
        (row) => row.competitionName
      )
    ),
    selectField(
      "categoryName",
      "Category",
      optionsFromRows(
        rows,
        (row) => row.categoryName,
        (row) => row.categoryName
      )
    ),
    selectField(
      "ageCategoryName",
      "Age Category",
      optionsFromRows(
        rows,
        (row) => row.ageCategoryName,
        (row) => row.ageCategoryName
      )
    ),
    selectField("genderEligibility", "Gender", GENDER_ELIGIBILITY_OPTIONS),
    selectField(
      "venueName",
      "Venue",
      optionsFromRows(
        rows,
        (row) => row.venueName,
        (row) => row.venueName
      )
    ),
    dateField("startAt", "Session"),
    dateField("endAt", "Ends"),
    numberField("entryCount", "Center Entries"),
  ];
}

export function getCenterFilterValue(
  row: CenterTableRow,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "competitionEntryRegistrationEnabled":
      return openClosed(row.competitionEntryRegistrationEnabled);
    case "guardianCount":
      return row.guardianCount;
    case "liaisonCount":
      return row.liaisonCount;
    case "status":
      return retiredStatus(row.retiredAt);
    case "studentRegistrationEnabled":
      return openClosed(row.studentRegistrationEnabled);
    default:
      return;
  }
}

export function createCenterFilterFields(): FilterField[] {
  return [
    selectField("status", "Status", RETIRED_STATUS_OPTIONS),
    selectField(
      "studentRegistrationEnabled",
      "Student registration",
      OPEN_CLOSED_OPTIONS
    ),
    selectField(
      "competitionEntryRegistrationEnabled",
      "Participation registration",
      OPEN_CLOSED_OPTIONS
    ),
    numberField("guardianCount", "Guardians"),
    numberField("liaisonCount", "Liaisons"),
  ];
}

export function getGuardianFilterValue(
  row: GuardianRosterItem,
  path: string[]
): unknown {
  if (path[0] === "state") {
    return row.state;
  }
}

export function createGuardianFilterFields(): FilterField[] {
  return [selectField("state", "Status", GUARDIAN_STATE_OPTIONS)];
}

export function getVolunteerFilterValue(
  row: VolunteerRosterItem,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "primary":
      return row.assignments.some((assignment) => assignment.isPrimary)
        ? "primary"
        : "secondary";
    case "responsibilities":
      return row.assignments.map((assignment) => assignment.responsibility);
    default:
      return;
  }
}

export function createVolunteerFilterFields(
  rows: readonly VolunteerRosterItem[]
): FilterField[] {
  return [
    {
      defaultOperator: "has_any_of",
      id: "responsibilities",
      label: "Responsibility",
      options: optionsFromRows(
        rows.flatMap((row) => row.assignments),
        (assignment) => assignment.responsibility,
        (assignment) =>
          KALAKRITI_RESPONSIBILITY_LABELS[assignment.responsibility]
      ),
      type: "multiselect",
    },
    selectField("primary", "Primary role", PRIMARY_ROLE_OPTIONS),
  ];
}

export function getCompetitionFilterValue(
  row: CompetitionTableRow,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "ageCategories":
      return row.divisions.map((division) => division.ageCategoryId);
    case "categoryName":
      return row.categoryName;
    case "genderEligibility":
      return row.genderEligibility;
    case "maximumGroupSize":
      return row.maximumGroupSize;
    case "minimumGroupSize":
      return row.minimumGroupSize;
    case "participationMode":
      return row.participationMode;
    case "status":
      return getCompetitionStatus(row);
    default:
      return;
  }
}

export function createCompetitionFilterFields(
  rows: readonly CompetitionTableRow[]
): FilterField[] {
  return [
    selectField("status", "Status", COMPETITION_STATUS_OPTIONS),
    selectField("participationMode", "Format", PARTICIPATION_MODE_OPTIONS),
    selectField("genderEligibility", "Eligibility", GENDER_ELIGIBILITY_OPTIONS),
    selectField(
      "categoryName",
      "Category",
      optionsFromRows(
        rows,
        (row) => row.categoryName,
        (row) => row.categoryName
      )
    ),
    {
      defaultOperator: "has_any_of",
      id: "ageCategories",
      label: "Age Categories",
      options: optionsFromRows(
        rows.flatMap((row) => row.divisions),
        (division) => division.ageCategoryId,
        (division) => division.ageCategory?.name ?? division.ageCategoryId
      ),
      type: "multiselect",
    },
    numberField("minimumGroupSize", "Min group size"),
    numberField("maximumGroupSize", "Max group size"),
  ];
}

export function getCompetitionCategoryFilterValue(
  row: CompetitionCategoryTableRow,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "competitionCount":
      return row.competitionCount;
    case "sortOrder":
      return row.sortOrder;
    case "status":
      return retiredStatus(row.retiredAt);
    default:
      return;
  }
}

export function createCompetitionCategoryFilterFields(): FilterField[] {
  return [
    selectField("status", "Status", RETIRED_STATUS_OPTIONS),
    numberField("sortOrder", "Display order"),
    numberField("competitionCount", "Competitions"),
  ];
}

export function getCompetitionSessionFilterValue(
  row: ScheduleTableRow,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "ageCategoryName":
      return row.ageCategoryName;
    case "competitionName":
      return row.competitionName;
    case "endAt":
      return row.endAt;
    case "startAt":
      return row.startAt;
    case "status":
      return row.cancelledAt === null ? "scheduled" : "cancelled";
    case "venueName":
      return row.venueName;
    default:
      return;
  }
}

export function createCompetitionSessionFilterFields(
  rows: readonly ScheduleTableRow[]
): FilterField[] {
  return [
    selectField("status", "Status", SESSION_STATUS_OPTIONS),
    selectField(
      "competitionName",
      "Competition",
      optionsFromRows(
        rows,
        (row) => row.competitionName,
        (row) => row.competitionName
      )
    ),
    selectField(
      "ageCategoryName",
      "Age Category",
      optionsFromRows(
        rows,
        (row) => row.ageCategoryName,
        (row) => row.ageCategoryName
      )
    ),
    selectField(
      "venueName",
      "Venue",
      optionsFromRows(
        rows,
        (row) => row.venueName,
        (row) => row.venueName
      )
    ),
    dateField("startAt", "Starts"),
    dateField("endAt", "Ends"),
  ];
}

export function getVenueFilterValue(
  row: VenueTableRow,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "sessionCount":
      return row.sessionCount;
    case "status":
      return retiredStatus(row.retiredAt);
    default:
      return;
  }
}

export function createVenueFilterFields(): FilterField[] {
  return [
    selectField("status", "Status", RETIRED_STATUS_OPTIONS),
    numberField("sessionCount", "Scheduled Sessions"),
  ];
}
