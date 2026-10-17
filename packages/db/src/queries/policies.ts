import {
  type DeclaredInterest,
  paymentWarnings,
  policyVersionOn,
  SAFEGUARDING_POLICY_KEY,
} from "@pi-dash/shared/declarations";
import { boardOn } from "@pi-dash/shared/governance";
import { and, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import {
  conflictDeclaration,
  policy,
  policyAcknowledgement,
  policyVersion,
} from "../schema/declarations";
import { trustee } from "../schema/governance";
import { team } from "../schema/team";
import { teamEvent } from "../schema/team-event";
import { loadRegister } from "./resolutions";

export class PolicyError extends Error {}

/** The child-safeguarding policy every deployment has; versions are published in the app. */
export async function ensureSafeguardingPolicy(): Promise<void> {
  const now = new Date();
  await db
    .insert(policy)
    .values({
      audience: "everyone",
      createdAt: now,
      description:
        "How volunteers keep the children at our events safe. Everyone acknowledges the version in force before joining an event with children.",
      gatesChildren: true,
      id: uuidv7(),
      key: SAFEGUARDING_POLICY_KEY,
      title: "Child-safeguarding policy",
      updatedAt: now,
    })
    .onConflictDoNothing({ target: policy.key });
}

/** The versions in force today of the policies that gate events with children. */
async function gatingVersionsInForce(today: string): Promise<string[]> {
  const rows = await db
    .select({
      effectiveOn: policyVersion.effectiveOn,
      id: policyVersion.id,
      policyId: policyVersion.policyId,
      version: policyVersion.version,
    })
    .from(policyVersion)
    .innerJoin(policy, eq(policy.id, policyVersion.policyId))
    .where(eq(policy.gatesChildren, true));
  const byPolicy = new Map<string, typeof rows>();
  for (const r of rows) {
    byPolicy.set(r.policyId, [...(byPolicy.get(r.policyId) ?? []), r]);
  }
  return [...byPolicy.values()]
    .map((versions) => policyVersionOn(versions, today)?.id)
    .filter((id): id is string => !!id);
}

/**
 * Whether the safeguarding gate keeps a user out of an event: it involves
 * children (Kalakriti, or a team that works with children) and the user
 * hasn't acknowledged a gating version in force. For paths outside Zero
 * (the WhatsApp RSVP); the mutators check the same in `safeguarding.ts`.
 */
export async function safeguardingBlocks(
  eventId: string,
  userId: string,
  today: string
): Promise<boolean> {
  const [event] = await db
    .select({
      managementDomain: teamEvent.managementDomain,
      worksWithChildren: team.worksWithChildren,
    })
    .from(teamEvent)
    .innerJoin(team, eq(team.id, teamEvent.teamId))
    .where(eq(teamEvent.id, eventId))
    .limit(1);
  if (
    !(
      event &&
      (event.managementDomain === "kalakriti" || event.worksWithChildren)
    )
  ) {
    return false;
  }
  const versionIds = await gatingVersionsInForce(today);
  if (versionIds.length === 0) {
    return false;
  }
  const acknowledged = await db
    .select({ id: policyAcknowledgement.policyVersionId })
    .from(policyAcknowledgement)
    .where(
      and(
        eq(policyAcknowledgement.userId, userId),
        inArray(policyAcknowledgement.policyVersionId, versionIds)
      )
    );
  return acknowledged.length < versionIds.length;
}

// ── Declarations ────────────────────────────────────────────────────────────

/** Records a trustee's declaration for a year, replacing an earlier one. */
export async function saveConflictDeclaration(input: {
  declaredBy: string;
  documentId: string;
  fiscalYear: string;
  interests: DeclaredInterest[];
  trusteeId: string;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(conflictDeclaration)
    .values({
      createdAt: now,
      declaredAt: now,
      declaredBy: input.declaredBy,
      documentId: input.documentId,
      fiscalYear: input.fiscalYear,
      id: uuidv7(),
      interests: input.interests,
      nothingToDeclare: input.interests.length === 0,
      trusteeId: input.trusteeId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        declaredAt: now,
        declaredBy: input.declaredBy,
        documentId: input.documentId,
        interests: input.interests,
        nothingToDeclare: input.interests.length === 0,
        updatedAt: now,
      },
      target: [conflictDeclaration.trusteeId, conflictDeclaration.fiscalYear],
    });
}

/**
 * Warnings for paying a payee on a day: the payee is a trustee in office
 * then (clause 7.24) or a party a trustee declared for that financial year.
 */
export async function paymentGovernanceWarnings(
  payeeName: string,
  on: string,
  fiscalYear: string
) {
  const register = await loadRegister(db, on);
  const board = boardOn(register, on);
  const declarations = await db
    .select({
      interests: conflictDeclaration.interests,
      trusteeName: trustee.legalName,
    })
    .from(conflictDeclaration)
    .innerJoin(trustee, eq(trustee.id, conflictDeclaration.trusteeId))
    .where(eq(conflictDeclaration.fiscalYear, fiscalYear));
  return paymentWarnings({
    declarations,
    payeeName,
    trustees: board.map((m) => ({ legalName: m.trustee.legalName })),
  });
}
