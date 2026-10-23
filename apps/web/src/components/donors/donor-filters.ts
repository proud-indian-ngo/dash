// Probe for selective E2E; not for merge.
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";

import { selectField } from "@/components/data-table/filter-fields";

import { ROLE_LABELS, type PartyRow } from "./party-row";

const KIND_OPTIONS = [
  { label: "Person", value: "person" },
  { label: "Organisation", value: "organisation" },
];

export function getDonorFilterValue(row: PartyRow, path: string[]): unknown {
  const [key] = path;
  switch (key) {
    case "kind":
      return row.kind;
    case "roles":
      return row.roles.filter((r) => r.active).map((r) => r.role);
    default:
      return;
  }
}

export const DONOR_FILTER_FIELDS: FilterField[] = [
  selectField("kind", "Kind", KIND_OPTIONS),
  {
    defaultOperator: "has_any_of",
    id: "roles",
    label: "Roles",
    operators: [{ arity: "many", label: "includes", value: "has_any_of" }],
    options: Object.entries(ROLE_LABELS).map(([value, label]) => ({
      label,
      value,
    })),
    type: "select",
  },
];
