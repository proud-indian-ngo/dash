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

export function activeRoleLabels(row: PartyRow): string[] {
  return row.roles
    .filter((r) => r.active)
    .map((r) => ROLE_LABELS[r.role as PartyRoleValue] ?? r.role);
}
