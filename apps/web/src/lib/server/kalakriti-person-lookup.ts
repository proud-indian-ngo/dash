import { db } from "@pi-dash/db";
import {
  kalakritiAssignment,
  kalakritiCenter,
  kalakritiEditionMembership,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { KALAKRITI_RESPONSIBILITY_LABELS } from "@pi-dash/shared/kalakriti";
import { and, eq, or, sql } from "drizzle-orm";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

export function canLookupKalakritiPerson(
  access: KalakritiEditionAccess | null | undefined
): boolean {
  return Boolean(
    access &&
    (access.isGlobalAdmin ||
      access.membership?.responsibilities.includes("edition_admin"))
  );
}

export interface KalakritiPersonLookupResult {
  humanId: string;
  kind: "student" | "volunteer" | "guardian";
  name: string;
  scopeLabel: string;
}

// Identifier QR codes are not bearer credentials. The API independently authorizes
// the actor before calling this allowlisted, Edition-bound lookup.
export async function lookupKalakritiPerson({
  editionId,
  humanId,
}: {
  editionId: string;
  humanId: string;
}): Promise<KalakritiPersonLookupResult | null> {
  const [student] = await db
    .select({
      centerName: kalakritiCenter.name,
      humanId: kalakritiStudent.humanId,
      name: kalakritiStudent.name,
    })
    .from(kalakritiStudent)
    .innerJoin(
      kalakritiCenter,
      and(
        eq(kalakritiStudent.centerId, kalakritiCenter.id),
        eq(kalakritiCenter.editionId, editionId)
      )
    )
    .where(
      and(
        or(
          eq(kalakritiStudent.humanId, humanId),
          eq(sql`${kalakritiStudent.id}::text`, humanId)
        ),
        eq(kalakritiStudent.editionId, editionId)
      )
    )
    .limit(1);
  if (student) {
    return {
      humanId: student.humanId,
      kind: "student",
      name: student.name,
      scopeLabel: student.centerName,
    };
  }
  const [membership] = await db
    .select({
      humanId: kalakritiEditionMembership.humanId,
      id: kalakritiEditionMembership.id,
      kind: kalakritiEditionMembership.kind,
      name: kalakritiEditionMembership.snapshotName,
      responsibility: kalakritiAssignment.responsibility,
    })
    .from(kalakritiEditionMembership)
    .leftJoin(
      kalakritiAssignment,
      and(
        eq(kalakritiAssignment.membershipId, kalakritiEditionMembership.id),
        eq(kalakritiAssignment.editionId, editionId),
        eq(kalakritiAssignment.isPrimary, true)
      )
    )
    .where(
      and(
        eq(kalakritiEditionMembership.editionId, editionId),
        eq(kalakritiEditionMembership.state, "active"),
        or(
          eq(kalakritiEditionMembership.humanId, humanId),
          eq(sql`${kalakritiEditionMembership.id}::text`, humanId)
        )
      )
    )
    .limit(1);
  if (!membership) return null;
  return {
    humanId: membership.humanId ?? membership.id,
    kind: membership.kind,
    name: membership.name,
    scopeLabel:
      membership.kind === "guardian"
        ? "Guardian"
        : membership.responsibility
          ? KALAKRITI_RESPONSIBILITY_LABELS[membership.responsibility]
          : "Unassigned",
  };
}
