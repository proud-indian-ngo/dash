import type { PartyRole as PartyRoleValue } from "@pi-dash/shared/constants";
import type { Party, PartyRole } from "@pi-dash/zero/schema";

/** A party with its roles, as the directory query returns it. */
export type PartyRow = Party & { roles: readonly PartyRole[] };

export const ROLE_LABELS: Record<PartyRoleValue, string> = {
  donor: "Donor",
  grantor: "Grantor",
  intermediary: "Intermediary",
  judge: "Judge",
  partner: "Partner",
  sponsor: "Sponsor",
  vendor: "Vendor",
  volunteer: "Volunteer",
};

/** Roles the directory manages; the rest are set by their own workflows. */
export const DIRECTORY_ROLES = [
  "donor",
  "sponsor",
  "grantor",
  "intermediary",
] as const satisfies readonly PartyRoleValue[];
export type DirectoryRole = (typeof DIRECTORY_ROLES)[number];

export function activeRoleLabels(row: PartyRow): string[] {
  return row.roles
    .filter((r) => r.active)
    .map((r) => ROLE_LABELS[r.role as PartyRoleValue] ?? r.role);
}
