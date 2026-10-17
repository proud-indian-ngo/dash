import { db } from ".";
import { ensureGovernanceReferenceData } from "./queries/governance";
import { trustee, trusteeOffice, trusteeTerm } from "./schema/governance";

/**
 * A fictional board shaped like the real one at design time
 * ("Board at design time" in governance.md): two trustees in office, a
 * former Managing Trustee who resigned, a former trustee whose start has no
 * document, and offices that changed hands. No documents: every date shows
 * as unevidenced until one is linked. Fixed IDs, so seeding twice is safe.
 * Used by the dev seed and the E2E seed.
 */

export const GOVERNANCE_SEED_IDS = {
  formerManagingTrustee: "01930000-0000-7000-8000-00000000d104",
  formerVicePresident: "01930000-0000-7000-8000-00000000d103",
  jointManagingTrustee: "01930000-0000-7000-8000-00000000d102",
  managingTrustee: "01930000-0000-7000-8000-00000000d101",
} as const;

const T = GOVERNANCE_SEED_IDS;

export async function ensureGovernanceFixtures(options: {
  /** Account linked to the trustee in office who is not a Co-Founder. */
  linkedUserId: string | null;
}): Promise<void> {
  await ensureGovernanceReferenceData();
  const now = new Date();
  await db
    .insert(trustee)
    .values([
      {
        createdAt: now,
        id: T.managingTrustee,
        isCoFounder: true,
        legalName: "Asha Rao",
        updatedAt: now,
        userId: null,
      },
      {
        createdAt: now,
        id: T.jointManagingTrustee,
        isCoFounder: false,
        legalName: "Vikram Menon",
        updatedAt: now,
        userId: options.linkedUserId,
      },
      {
        createdAt: now,
        id: T.formerVicePresident,
        isCoFounder: false,
        legalName: "Meera Iyer",
        updatedAt: now,
        userId: null,
      },
      {
        createdAt: now,
        id: T.formerManagingTrustee,
        isCoFounder: true,
        legalName: "Rahul Das",
        updatedAt: now,
        userId: null,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(trusteeTerm)
    .values([
      {
        basis: "deed_original",
        createdAt: now,
        id: "01930000-0000-7000-8000-00000000d201",
        startsOn: "2019-03-16",
        trusteeId: T.managingTrustee,
        updatedAt: now,
        validityNote: "Named in the deed; life term under clause 4.4.",
      },
      {
        basis: "co_option_4_5",
        createdAt: now,
        endsOn: "2028-12-06",
        id: "01930000-0000-7000-8000-00000000d202",
        startsOn: "2025-12-07",
        trusteeId: T.jointManagingTrustee,
        updatedAt: now,
        validityNote:
          "Meeting inquorate; co-option relies on clause 4.5 and was ratified by circular.",
      },
      {
        basis: "co_option_4_5",
        cessationBasis: "resignation",
        createdAt: now,
        endedOn: "2026-10-16",
        endsOn: "2027-01-09",
        id: "01930000-0000-7000-8000-00000000d203",
        startsOn: "2024-01-10",
        trusteeId: T.formerVicePresident,
        updatedAt: now,
        validityNote: "Start date unevidenced; resigned by email.",
      },
      {
        basis: "deed_original",
        cessationBasis: "resignation",
        createdAt: now,
        endedOn: "2026-04-04",
        id: "01930000-0000-7000-8000-00000000d204",
        startsOn: "2019-03-16",
        trusteeId: T.formerManagingTrustee,
        updatedAt: now,
        validityNote: "Resigned by a DSC-signed letter.",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(trusteeOffice)
    .values([
      {
        createdAt: now,
        endedOn: "2026-04-04",
        id: "01930000-0000-7000-8000-00000000d301",
        office: "managing_trustee",
        startsOn: "2019-03-16",
        trusteeId: T.formerManagingTrustee,
        updatedAt: now,
      },
      {
        createdAt: now,
        id: "01930000-0000-7000-8000-00000000d302",
        office: "managing_trustee",
        startsOn: "2026-04-04",
        trusteeId: T.managingTrustee,
        updatedAt: now,
      },
      {
        createdAt: now,
        id: "01930000-0000-7000-8000-00000000d303",
        office: "secretary",
        startsOn: "2025-12-07",
        trusteeId: T.jointManagingTrustee,
        updatedAt: now,
      },
      {
        createdAt: now,
        id: "01930000-0000-7000-8000-00000000d304",
        office: "joint_managing_trustee",
        startsOn: "2026-10-18",
        trusteeId: T.jointManagingTrustee,
        updatedAt: now,
      },
      {
        createdAt: now,
        endedOn: "2026-10-16",
        id: "01930000-0000-7000-8000-00000000d305",
        office: "vice_president",
        startsOn: "2024-01-10",
        trusteeId: T.formerVicePresident,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();
}
