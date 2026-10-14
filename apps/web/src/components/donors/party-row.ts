import type { PartyRole as PartyRoleValue } from "@pi-dash/shared/constants";
import { CONTRIBUTOR_ROLES, canGive } from "@pi-dash/shared/income";
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

/**
 * Picker options for the giver of a contribution: any party with an active
 * donor, sponsor, grantor or intermediary role, labelled with those roles.
 * A donation platform such as GiveIndia is offered only if it also holds a
 * giver role of its own.
 */
export function contributorOptions(
  rows: readonly PartyRow[]
): { label: string; value: string }[] {
  return rows.flatMap((row) => {
    const active = row.roles.filter((r) => r.active).map((r) => r.role);
    if (!canGive(row.id, active)) {
      return [];
    }
    const roles = row.roles
      .filter(
        (r) =>
          r.active && (CONTRIBUTOR_ROLES as readonly string[]).includes(r.role)
      )
      .map((r) => ROLE_LABELS[r.role as PartyRoleValue] ?? r.role);
    return roles.length > 0
      ? [{ label: `${row.displayName} (${roles.join(", ")})`, value: row.id }]
      : [];
  });
}
