import type { DonationType } from "./constants";

/**
 * What a gift's donation type says about its programme: a specific grant or
 * a CSR gift is for a named programme, a corpus gift goes to the corpus and
 * has none, and voluntary or other gifts may name one. A project sets the
 * programme, so it counts as naming one. The contribution form, the
 * contribution mutators and imports all apply this.
 */
export type ProgrammeNeed = "none" | "optional" | "required";

export const DONATION_TYPE_PROGRAMME: Record<DonationType, ProgrammeNeed> = {
  corpus: "none",
  csr: "required",
  other: "optional",
  specific_grant: "required",
  voluntary: "optional",
};

const REQUIRED_MESSAGES: Partial<Record<DonationType, string>> = {
  csr: "A CSR gift needs the programme it's for",
  specific_grant: "A specific grant needs the programme it's for",
};

/** Why the programme does not fit the donation type, or null when it does. */
export function donationTypeProgrammeIssue(gift: {
  donationType: DonationType;
  programmeId?: string | null;
  projectId?: string | null;
}): string | null {
  const named = Boolean(gift.programmeId || gift.projectId);
  const need = DONATION_TYPE_PROGRAMME[gift.donationType];
  if (need === "required" && !named) {
    return REQUIRED_MESSAGES[gift.donationType] ?? null;
  }
  if (need === "none" && named) {
    return "A corpus gift has no programme";
  }
  return null;
}
