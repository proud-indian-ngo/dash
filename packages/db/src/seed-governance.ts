import { fiscalYearLabel } from "@pi-dash/shared/compliance";
import { DEED_VERSION_1, deedVersionOn } from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { kolkataInstant } from "@pi-dash/shared/meetings";

import { db } from ".";
import {
  ensureComplianceTemplates,
  generateComplianceItems,
} from "./queries/compliance";
import { ensureGovernanceReferenceData } from "./queries/governance";
import { ensureSafeguardingPolicy } from "./queries/policies";
import {
  conflictDeclaration,
  policy,
  policyAcknowledgement,
  policyVersion,
} from "./schema/declarations";
import {
  deedVersion,
  governanceDocument,
  resolution,
  trustee,
  trusteeOffice,
  trusteeTerm,
} from "./schema/governance";
import { agendaItem, meeting, meetingAttendance } from "./schema/meetings";

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
  /** Account linked to the Joint Managing Trustee (Vikram Menon), if any. */
  jointManagingTrusteeUserId: string | null;
  /** Account linked to the Managing Trustee (Asha Rao), who issues circulars. */
  managingTrusteeUserId: string | null;
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
        userId: options.managingTrusteeUserId,
      },
      {
        createdAt: now,
        id: T.jointManagingTrustee,
        isCoFounder: false,
        legalName: "Vikram Menon",
        updatedAt: now,
        userId: options.jointManagingTrusteeUserId,
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

/** The default compliance calendar and its items from today. */
export async function ensureComplianceFixtures(): Promise<void> {
  await ensureComplianceTemplates();
  await generateComplianceItems(todayInKolkata());
}

/**
 * A planned amendment for the E2E board: a quorum of half the trustees in
 * office (never fewer than two, the Managing Trustee among them), with video
 * counting as present, from 1 Jan 2026. Version 1 can't be quorate with this
 * board, so meeting specs need it. Not in the dev seed.
 */
export const DEED_VERSION_2_ID = "01930000-0000-7000-8000-00000000d002";

export async function ensureAmendedDeedFixture(): Promise<void> {
  const { rules } = DEED_VERSION_1;
  await db
    .insert(deedVersion)
    .values({
      amendmentThreshold: rules.amendmentThreshold,
      castingVote: rules.castingVote,
      circularIssuers: [...rules.circularIssuers],
      coOptionMaxYears: rules.coOptionMaxYears,
      createdAt: new Date(),
      documentId: null,
      effectiveFrom: "2026-01-01",
      electronicCirculation: rules.electronicCirculation,
      id: DEED_VERSION_2_ID,
      maxTrustees: rules.maxTrustees,
      minTrustees: rules.minTrustees,
      noticeDays: rules.noticeDays,
      number: 2,
      quorumFloor: 2,
      quorumKind: "fraction",
      quorumRequiredOffice: "managing_trustee",
      quorumValue: 50,
      title: "Deed of amendment (planned), 2026",
      videoCountsPresent: true,
    })
    .onConflictDoNothing();
}

export const MEETING_SEED_IDS = {
  meeting: "01930000-0000-7000-8000-00000000d401",
  resolution: "01930000-0000-7000-8000-00000000d411",
} as const;

/**
 * A board meeting on 10 Oct 2026 whose notice has gone out: the three
 * trustees in office that day on the attendance list (all absent until
 * marked), a resolution to approve the budget and a discussion item. Specs
 * take it through attendance, votes, the decision and the minutes.
 */
export async function ensureMeetingFixtures(): Promise<void> {
  const meetingOn = "2026-10-10";
  const versions = await db.select().from(deedVersion);
  const inForce = deedVersionOn(versions, meetingOn);
  const now = new Date();
  const created = await db
    .insert(meeting)
    .values({
      chairTrusteeId: T.managingTrustee,
      createdAt: now,
      deedVersionId: inForce?.id ?? null,
      id: MEETING_SEED_IDS.meeting,
      mode: "hybrid",
      noticeSentAt: new Date(kolkataInstant("2026-10-01", "09:00")),
      place: "Registered office, Bengaluru",
      startsAt: new Date(kolkataInstant(meetingOn, "10:00")),
      status: "convened",
      title: "Board meeting, October 2026",
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: meeting.id });
  if (created.length === 0) {
    return;
  }
  await db
    .insert(meetingAttendance)
    .values(
      [
        { offices: ["managing_trustee"], trusteeId: T.managingTrustee },
        { offices: ["secretary"], trusteeId: T.jointManagingTrustee },
        { offices: ["vice_president"], trusteeId: T.formerVicePresident },
      ].map((a, index) => ({
        id: `01930000-0000-7000-8000-00000000d42${String(index)}`,
        meetingId: MEETING_SEED_IDS.meeting,
        offices: a.offices as (
          | "managing_trustee"
          | "secretary"
          | "vice_president"
        )[],
        presence: "absent" as const,
        trusteeId: a.trusteeId,
      }))
    )
    .onConflictDoNothing();
  await db
    .insert(resolution)
    .values({
      body: "RESOLVED THAT the budget for 2027-28, as placed before the Board, be and is hereby approved.",
      createdAt: now,
      effect: { type: "none" },
      historical: false,
      id: MEETING_SEED_IDS.resolution,
      kind: "meeting",
      status: "draft",
      templateKey: "ordinary",
      title: "Approve the budget for 2027-28",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(agendaItem)
    .values([
      {
        createdAt: now,
        id: "01930000-0000-7000-8000-00000000d431",
        kind: "resolution" as const,
        meetingId: MEETING_SEED_IDS.meeting,
        position: 1,
        resolutionId: MEETING_SEED_IDS.resolution,
        title: "Approve the budget for 2027-28",
        updatedAt: now,
      },
      {
        createdAt: now,
        id: "01930000-0000-7000-8000-00000000d432",
        kind: "discussion" as const,
        meetingId: MEETING_SEED_IDS.meeting,
        notes: "The secretary reported on the year's programmes.",
        position: 2,
        resolutionId: null,
        title: "Programme review",
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();
}

export const POLICY_SEED_DOCUMENT_ID = "01930000-0000-7000-8000-00000000d501";

/**
 * The child-safeguarding policy (no version, so nothing is gated) and an
 * approved policy document in the vault for specs that publish a version.
 * The document's file isn't stored; nothing downloads it.
 */
export async function ensurePolicyFixtures(): Promise<void> {
  await ensureSafeguardingPolicy();
  await db
    .insert(governanceDocument)
    .values({
      contentType: "application/pdf",
      createdAt: new Date(),
      datedOn: "2026-04-01",
      id: POLICY_SEED_DOCUMENT_ID,
      kind: "policy",
      note: "Seeded for the policy register.",
      objectKey: `seed/governance/documents/${POLICY_SEED_DOCUMENT_ID}/code-of-conduct.pdf`,
      originalFilename: "code-of-conduct.pdf",
      sha256: "0".repeat(64),
      sizeBytes: 1024,
      sourceFormat: "pdf",
      title: "Volunteer code of conduct (approved)",
      uploadedBy: null,
    })
    .onConflictDoNothing();
}

/**
 * Dev examples for the policy register and declarations: a code of conduct
 * with its first version, acknowledged by the given account, and the
 * Managing Trustee's declaration for the year with nothing to declare. Not
 * in the E2E seed, so specs see their own state.
 */
export async function ensureDevPolicyExamples(
  acknowledgedBy: string | null
): Promise<void> {
  const now = new Date();
  const policyId = "01930000-0000-7000-8000-00000000d511";
  const versionId = "01930000-0000-7000-8000-00000000d512";
  await db
    .insert(policy)
    .values({
      audience: "everyone",
      createdAt: now,
      description: "How volunteers conduct themselves at events and online.",
      gatesChildren: false,
      id: policyId,
      key: null,
      title: "Volunteer code of conduct",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(policyVersion)
    .values({
      documentId: POLICY_SEED_DOCUMENT_ID,
      effectiveOn: "2026-04-01",
      id: versionId,
      policyId,
      publishedAt: now,
      publishedBy: acknowledgedBy,
      summary: "First version.",
      version: 1,
    })
    .onConflictDoNothing();
  if (acknowledgedBy) {
    await db
      .insert(policyAcknowledgement)
      .values({
        acknowledgedAt: now,
        id: "01930000-0000-7000-8000-00000000d513",
        policyVersionId: versionId,
        userId: acknowledgedBy,
      })
      .onConflictDoNothing();
  }
  await db
    .insert(conflictDeclaration)
    .values({
      createdAt: now,
      declaredAt: now,
      declaredBy: null,
      documentId: null,
      fiscalYear: fiscalYearLabel(todayInKolkata()),
      id: "01930000-0000-7000-8000-00000000d521",
      interests: [],
      nothingToDeclare: true,
      status: "confirmed",
      trusteeId: T.managingTrustee,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

/**
 * For E2E: the Joint Managing Trustee's declaration for the year, naming
 * the vendor of the seeded vendor payment, so the approver's warning can be
 * checked without making a declaration's PDF.
 */
export async function ensureDeclarationFixture(
  vendorName: string
): Promise<void> {
  const now = new Date();
  await db
    .insert(conflictDeclaration)
    .values({
      createdAt: now,
      declaredAt: now,
      declaredBy: null,
      documentId: null,
      fiscalYear: fiscalYearLabel(todayInKolkata()),
      id: "01930000-0000-7000-8000-00000000d522",
      interests: [
        {
          nature: "Event supplies",
          party: vendorName,
          relationship: "Brother's firm",
        },
      ],
      nothingToDeclare: false,
      status: "confirmed",
      trusteeId: T.jointManagingTrustee,
      updatedAt: now,
    })
    .onConflictDoNothing();
}
