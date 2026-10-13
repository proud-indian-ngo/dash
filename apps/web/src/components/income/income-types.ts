import type {
  Contribution,
  Fund,
  OrgAccount,
  OtherIncome,
  Party,
  Programme,
  Project,
} from "@pi-dash/zero/schema";

/** A contribution as the Income page query returns it. */
export type ContributionRow = Contribution & {
  fund?: Fund | null;
  orgAccount?: OrgAccount | null;
  party?: Party | null;
  programme?: Programme | null;
  project?: Project | null;
};

export type OtherIncomeRow = OtherIncome & {
  fund?: Fund | null;
  orgAccount?: OrgAccount | null;
};

export function donorName(row: ContributionRow): string {
  return row.party?.displayName ?? "Unknown donor";
}

/** "Programme · Project", or whichever is set. */
export function programmeLabel(row: ContributionRow): string | null {
  const parts = [row.programme?.name, row.project?.name].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
