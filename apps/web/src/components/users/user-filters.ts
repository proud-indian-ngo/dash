import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import type { User } from "@pi-dash/zero/schema";
import { dateField, selectField } from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";

const ACTIVE_OPTIONS = [
  { label: "Active", value: "yes" },
  { label: "Inactive", value: "no" },
];
const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];
const BANNED_OPTIONS = [
  { label: "Banned", value: "yes" },
  { label: "Not Banned", value: "no" },
];
const WHATSAPP_OPTIONS = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];
const EMAIL_VERIFIED_OPTIONS = [
  { label: "Verified", value: "yes" },
  { label: "Unverified", value: "no" },
];

const LEGACY_USER_FILTER_PARAMS = [
  { param: "role", path: "role" },
  { param: "active", path: "active" },
  { param: "gender", path: "gender" },
  { param: "banned", path: "banned" },
] as const;

export function getUserFilterValue(row: User, path: string[]): unknown {
  const [key] = path;
  switch (key) {
    case "active":
      return row.isActive ? "yes" : "no";
    case "banExpires":
      return row.banExpires;
    case "banned":
      return row.banned ? "yes" : "no";
    case "createdAt":
      return row.createdAt;
    case "dob":
      return row.dob;
    case "emailVerified":
      return row.emailVerified ? "yes" : "no";
    case "gender":
      return row.gender;
    case "isOnWhatsapp":
      return row.isOnWhatsapp ? "yes" : "no";
    case "role":
      return row.role;
    case "updatedAt":
      return row.updatedAt;
    default:
      return;
  }
}

export function createUserFilterFields(
  roleOptions: { label: string; value: string }[]
): FilterField[] {
  return [
    selectField("role", "Role", roleOptions),
    selectField("active", "Active", ACTIVE_OPTIONS),
    selectField("gender", "Gender", GENDER_OPTIONS),
    dateField("dob", "DOB"),
    selectField("isOnWhatsapp", "WhatsApp", WHATSAPP_OPTIONS),
    selectField("emailVerified", "Email Verified", EMAIL_VERIFIED_OPTIONS),
    selectField("banned", "Banned", BANNED_OPTIONS),
    dateField("banExpires", "Ban Expires"),
    dateField("createdAt", "Created"),
    dateField("updatedAt", "Updated"),
  ];
}

export function useMigrateLegacyUserFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_USER_FILTER_PARAMS);
}
