import { CORPUS_FUND_ID, type DonationType } from "./constants";

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

/**
 * What the corpus type says about the fund: a corpus gift is the donor's
 * direction that it form part of the corpus, so it goes to the Corpus Fund
 * and its fund can't be changed, and only a corpus gift goes there. The
 * books credit a corpus gift to the Corpus Fund whatever fund it holds.
 * The contribution form, the contribution mutators and imports apply this.
 */
export function donationTypeFundIssue(gift: {
  donationType: DonationType;
  fundId?: string | null;
}): string | null {
  if (!gift.fundId) {
    return null;
  }
  if (gift.donationType === "corpus" && gift.fundId !== CORPUS_FUND_ID) {
    return "A corpus gift goes to the Corpus Fund";
  }
  if (gift.donationType !== "corpus" && gift.fundId === CORPUS_FUND_ID) {
    return "Only a corpus gift goes to the Corpus Fund";
  }
  return null;
}

/** The fund a gift of this type must be recorded against, if the type decides it. */
export const fundForDonationType = (donationType: DonationType) =>
  donationType === "corpus" ? CORPUS_FUND_ID : null;
