import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import type { KalakritiAwardEntry } from "@pi-dash/shared/kalakriti-awards";

import {
  optionsFromRows,
  selectField,
} from "@/components/data-table/filter-fields";

export type AwardStatus = "pending" | "partial" | "awarded";

export const AWARD_LABELS = {
  runner_up: "Runner-up",
  winner: "Winner",
} as const;
export const STATUS_LABELS: Record<AwardStatus, string> = {
  awarded: "Awarded",
  partial: "Partially awarded",
  pending: "Pending",
};
export const TYPE_LABELS = {
  group: "Group",
  individual: "Individual",
} as const;

export function getAwardStatus(entry: KalakritiAwardEntry): AwardStatus {
  const awarded = entry.members.filter((member) => member.awarded).length;
  if (awarded === 0) return "pending";
  if (awarded === entry.members.length) return "awarded";
  return "partial";
}

export function awardRecipientCounts(entries: readonly KalakritiAwardEntry[]) {
  const total = entries.reduce((sum, entry) => sum + entry.members.length, 0);
  const awarded = entries.reduce(
    (sum, entry) =>
      sum + entry.members.filter((member) => member.awarded).length,
    0
  );
  return { awarded, pending: total - awarded, total };
}

export function searchAwardEntry(
  entry: KalakritiAwardEntry,
  query: string
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    entry.competitionName,
    entry.ageCategoryName,
    entry.centerName,
    AWARD_LABELS[entry.award],
    TYPE_LABELS[entry.type],
    STATUS_LABELS[getAwardStatus(entry)],
    ...entry.members.flatMap((member) => [member.name, member.humanId]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

export function getAwardFilterValue(
  entry: KalakritiAwardEntry,
  path: string[]
): unknown {
  switch (path[0]) {
    case "award":
      return entry.award;
    case "status":
      return getAwardStatus(entry);
    case "center":
      return entry.centerId;
    case "competition":
      return entry.competitionName;
    case "ageCategory":
      return entry.ageCategoryName;
    case "type":
      return entry.type;
    case "gender":
      return [...new Set(entry.members.map((member) => member.gender))];
    default:
      return;
  }
}

export function createAwardFilterFields(
  entries: readonly KalakritiAwardEntry[]
): FilterField[] {
  return [
    selectField("award", "Award", [
      { label: "Winner", value: "winner" },
      { label: "Runner-up", value: "runner_up" },
    ]),
    selectField("status", "Status", [
      { label: "Pending", value: "pending" },
      { label: "Partially awarded", value: "partial" },
      { label: "Awarded", value: "awarded" },
    ]),
    selectField(
      "center",
      "Center",
      optionsFromRows(
        entries,
        (entry) => entry.centerId,
        (entry) => entry.centerName
      )
    ),
    selectField(
      "competition",
      "Competition",
      optionsFromRows(
        entries,
        (entry) => entry.competitionName,
        (entry) => entry.competitionName
      )
    ),
    selectField(
      "ageCategory",
      "Age Category",
      optionsFromRows(
        entries,
        (entry) => entry.ageCategoryName,
        (entry) => entry.ageCategoryName
      )
    ),
    selectField("type", "Type", [
      { label: "Individual", value: "individual" },
      { label: "Group", value: "group" },
    ]),
    {
      defaultOperator: "has_any_of",
      id: "gender",
      label: "Gender",
      operators: [{ arity: "many", label: "includes", value: "has_any_of" }],
      options: [
        { label: "Female", value: "female" },
        { label: "Male", value: "male" },
      ],
      type: "select",
    },
  ];
}
