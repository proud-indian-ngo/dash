import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import {
  numberField,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";
import type { RoleListItem } from "@/functions/role-admin";

const TYPE_OPTIONS = [
  { label: "System", value: "system" },
  { label: "Custom", value: "custom" },
];

const LEGACY_ROLE_FILTER_PARAMS = [{ param: "type", path: "type" }] as const;

export function getRoleFilterValue(row: RoleListItem, path: string[]): unknown {
  const [key] = path;
  switch (key) {
    case "permissionCount":
      return row.permissionCount;
    case "type":
      return row.isSystem ? "system" : "custom";
    case "userCount":
      return row.userCount;
    default:
      return;
  }
}

export function createRoleFilterFields(): FilterField[] {
  return [
    selectField("type", "Type", TYPE_OPTIONS),
    numberField("permissionCount", "Permissions"),
    numberField("userCount", "Users"),
  ];
}

export function useMigrateLegacyRoleFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_ROLE_FILTER_PARAMS);
}
