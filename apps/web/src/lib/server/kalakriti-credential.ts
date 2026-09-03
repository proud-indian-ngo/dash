import { db } from "@pi-dash/db";
import {
  kalakritiAssignment,
  kalakritiAuditEntry,
  kalakritiCenter,
  kalakritiCredential,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import {
  type KalakritiCredentialBranding,
  resolveKalakritiCredentialBranding,
} from "@pi-dash/pdf/kalakriti-credential-branding";
import {
  formatKalakritiVolunteerHumanId,
  KALAKRITI_RESPONSIBILITY_LABELS,
} from "@pi-dash/shared/kalakriti";
import { and, eq, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { canManageKalakritiCredentials as canManageCredentials } from "@/lib/kalakriti-credential-policy";
import {
  assertCredentialPrintSubject,
  type CredentialPrintSubject,
  createOpaqueCredentialToken,
} from "@/lib/server/kalakriti-credential-token";

const PRINTABLE_LIFECYCLES = new Set([
  "draft",
  "live",
  "registration_locked",
  "registration_open",
]);

type CredentialPrintTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface PrintableEdition {
  brandingKey: string;
  lifecycle: string;
  nextVolunteerSequence: number;
  year: number;
}

interface CredentialCard {
  accentColor: string;
  backgroundColor: string;
  editionLabel: string;
  humanId: string;
  kind: "student" | "volunteer";
  name: string;
  qrToken: string;
  scopeLabel: string;
  textColor: string;
  wordmark: string;
}

export function canManageKalakritiCredentials(
  access: KalakritiEditionAccess
): boolean {
  return canManageCredentials(access);
}

function buildCredentialCard(
  branding: KalakritiCredentialBranding,
  editionLabel: string,
  card: Omit<
    CredentialCard,
    "accentColor" | "backgroundColor" | "textColor" | "wordmark"
  >
): CredentialCard {
  return {
    ...card,
    accentColor: branding.accentColor,
    backgroundColor: branding.backgroundColor,
    editionLabel,
    textColor: branding.textColor,
    wordmark: branding.wordmark,
  };
}

async function revokeActiveCredential(
  tx: CredentialPrintTx,
  args: {
    actorUserId: string;
    credentialId: string;
    now: number;
  }
): Promise<void> {
  await tx
    .update(kalakritiCredential)
    .set({
      revokedAt: new Date(args.now),
      revokedBy: args.actorUserId,
    })
    .where(eq(kalakritiCredential.id, args.credentialId));
}

export interface CredentialLookupResult {
  humanId: string;
  issuedAt: number;
  kind: "student" | "volunteer";
  name: string;
  scopeLabel: string;
}

export async function lookupKalakritiCredential({
  editionId,
  humanId,
}: {
  editionId: string;
  humanId: string;
}): Promise<CredentialLookupResult | null> {
  const [activeCredential] = await db
    .select({
      issuedAt: kalakritiCredential.issuedAt,
      membershipId: kalakritiCredential.membershipId,
      studentId: kalakritiCredential.studentId,
    })
    .from(kalakritiCredential)
    .where(
      and(
        eq(kalakritiCredential.editionId, editionId),
        eq(kalakritiCredential.humanId, humanId),
        isNull(kalakritiCredential.revokedAt)
      )
    )
    .limit(1);
  if (!activeCredential) {
    return null;
  }
  if (activeCredential.studentId) {
    const [student] = await db
      .select({
        centerName: kalakritiCenter.name,
        name: kalakritiStudent.name,
      })
      .from(kalakritiStudent)
      .innerJoin(
        kalakritiCenter,
        eq(kalakritiStudent.centerId, kalakritiCenter.id)
      )
      .where(eq(kalakritiStudent.id, activeCredential.studentId))
      .limit(1);
    if (!student) {
      return null;
    }
    return {
      humanId,
      issuedAt: activeCredential.issuedAt.getTime(),
      kind: "student",
      name: student.name,
      scopeLabel: student.centerName,
    };
  }
  if (!activeCredential.membershipId) {
    return null;
  }
  const [volunteer] = await db
    .select({
      name: kalakritiEditionMembership.snapshotName,
      responsibility: kalakritiAssignment.responsibility,
    })
    .from(kalakritiEditionMembership)
    .leftJoin(
      kalakritiAssignment,
      and(
        eq(kalakritiAssignment.membershipId, kalakritiEditionMembership.id),
        eq(kalakritiAssignment.isPrimary, true)
      )
    )
    .where(eq(kalakritiEditionMembership.id, activeCredential.membershipId))
    .limit(1);
  if (!volunteer) {
    return null;
  }
  return {
    humanId,
    issuedAt: activeCredential.issuedAt.getTime(),
    kind: "volunteer",
    name: volunteer.name,
    scopeLabel: volunteer.responsibility
      ? KALAKRITI_RESPONSIBILITY_LABELS[volunteer.responsibility]
      : "Unassigned",
  };
}

export type { CredentialPrintSubject } from "@/lib/server/kalakriti-credential-token";

export interface KalakritiCredentialListItem {
  editionId: string;
  humanId: string;
  id: string;
  issuedAt: number;
  kind: "student" | "volunteer";
  membershipId: string | null;
  name: string;
  revokedAt: number | null;
  scopeLabel: string;
  studentId: string | null;
}

export async function listKalakritiCredentialsForAdmin(
  editionId: string
): Promise<KalakritiCredentialListItem[]> {
  const rows = await db
    .select({
      centerName: kalakritiCenter.name,
      humanId: kalakritiCredential.humanId,
      id: kalakritiCredential.id,
      issuedAt: kalakritiCredential.issuedAt,
      membershipId: kalakritiCredential.membershipId,
      membershipName: kalakritiEditionMembership.snapshotName,
      responsibility: kalakritiAssignment.responsibility,
      revokedAt: kalakritiCredential.revokedAt,
      studentId: kalakritiCredential.studentId,
      studentName: kalakritiStudent.name,
    })
    .from(kalakritiCredential)
    .leftJoin(
      kalakritiStudent,
      eq(kalakritiCredential.studentId, kalakritiStudent.id)
    )
    .leftJoin(
      kalakritiCenter,
      eq(kalakritiStudent.centerId, kalakritiCenter.id)
    )
    .leftJoin(
      kalakritiEditionMembership,
      eq(kalakritiCredential.membershipId, kalakritiEditionMembership.id)
    )
    .leftJoin(
      kalakritiAssignment,
      and(
        eq(kalakritiAssignment.membershipId, kalakritiEditionMembership.id),
        eq(kalakritiAssignment.isPrimary, true)
      )
    )
    .where(eq(kalakritiCredential.editionId, editionId))
    .orderBy(kalakritiCredential.humanId);

  return rows.map((row) => {
    const isStudent = row.studentId !== null;
    let scopeLabel = "Unassigned";
    if (isStudent) {
      scopeLabel = row.centerName ?? "Unknown";
    } else if (row.responsibility) {
      scopeLabel = KALAKRITI_RESPONSIBILITY_LABELS[row.responsibility];
    }
    return {
      editionId,
      humanId: row.humanId,
      id: row.id,
      issuedAt: row.issuedAt.getTime(),
      kind: isStudent ? "student" : "volunteer",
      membershipId: row.membershipId,
      name: isStudent
        ? (row.studentName ?? "Unknown")
        : (row.membershipName ?? "Unknown"),
      revokedAt: row.revokedAt?.getTime() ?? null,
      scopeLabel,
      studentId: row.studentId,
    };
  });
}

interface PrintedCredentialResult {
  card: Omit<
    CredentialCard,
    "accentColor" | "backgroundColor" | "textColor" | "wordmark"
  >;
  credentialId: string;
  humanId: string;
  subjectKind: "student" | "volunteer";
}

async function insertCredentialPrintAudit(
  tx: CredentialPrintTx,
  args: {
    actorUserId: string;
    credentialId: string;
    editionId: string;
    humanId: string;
    now: number;
    subjectKind: "student" | "volunteer";
  }
): Promise<void> {
  await tx.insert(kalakritiAuditEntry).values({
    action: "printed",
    actorUserId: args.actorUserId,
    createdAt: new Date(args.now),
    domain: "credential",
    editionId: args.editionId,
    id: uuidv7(),
    metadata: {
      humanId: args.humanId,
      subjectKind: args.subjectKind,
    },
    reason: null,
    targetId: args.credentialId,
    targetType: "credential",
  });
}

async function printStudentCredential(
  tx: CredentialPrintTx,
  editionId: string,
  args: {
    actorUserId: string;
    editionLabel: string;
    now: number;
    studentId: string;
  }
): Promise<PrintedCredentialResult> {
  const [student] = await tx
    .select({
      centerName: kalakritiCenter.name,
      humanId: kalakritiStudent.humanId,
      name: kalakritiStudent.name,
    })
    .from(kalakritiStudent)
    .innerJoin(
      kalakritiCenter,
      eq(kalakritiStudent.centerId, kalakritiCenter.id)
    )
    .where(
      and(
        eq(kalakritiStudent.id, args.studentId),
        eq(kalakritiStudent.editionId, editionId)
      )
    )
    .limit(1);
  if (!student) {
    throw new Error("Student not found in this Edition");
  }
  const { token, tokenHash } = createOpaqueCredentialToken();
  const credentialId = uuidv7();
  const [active] = await tx
    .select({ id: kalakritiCredential.id })
    .from(kalakritiCredential)
    .where(
      and(
        eq(kalakritiCredential.studentId, args.studentId),
        isNull(kalakritiCredential.revokedAt)
      )
    )
    .limit(1);
  if (active) {
    await revokeActiveCredential(tx, {
      actorUserId: args.actorUserId,
      credentialId: active.id,
      now: args.now,
    });
  }
  await tx.insert(kalakritiCredential).values({
    createdAt: new Date(args.now),
    editionId,
    humanId: student.humanId,
    id: credentialId,
    issuedAt: new Date(args.now),
    issuedBy: args.actorUserId,
    membershipId: null,
    revokedAt: null,
    revokedBy: null,
    studentId: args.studentId,
    tokenHash,
  });
  return {
    card: {
      editionLabel: args.editionLabel,
      humanId: student.humanId,
      kind: "student",
      name: student.name,
      qrToken: token,
      scopeLabel: student.centerName,
    },
    credentialId,
    humanId: student.humanId,
    subjectKind: "student",
  };
}

async function allocateVolunteerHumanId(
  tx: CredentialPrintTx,
  edition: PrintableEdition,
  editionId: string,
  membershipId: string,
  now: number
): Promise<string> {
  const humanId = formatKalakritiVolunteerHumanId(
    edition.year,
    edition.nextVolunteerSequence
  );
  await tx
    .update(kalakritiEditionMembership)
    .set({ humanId, updatedAt: new Date(now) })
    .where(eq(kalakritiEditionMembership.id, membershipId));
  await tx
    .update(kalakritiEdition)
    .set({
      nextVolunteerSequence: edition.nextVolunteerSequence + 1,
    })
    .where(eq(kalakritiEdition.id, editionId));
  edition.nextVolunteerSequence += 1;
  return humanId;
}

async function printVolunteerCredential(
  tx: CredentialPrintTx,
  edition: PrintableEdition,
  editionId: string,
  args: {
    actorUserId: string;
    editionLabel: string;
    membershipId: string;
    now: number;
  }
): Promise<PrintedCredentialResult> {
  const [membership] = await tx
    .select({
      humanId: kalakritiEditionMembership.humanId,
      kind: kalakritiEditionMembership.kind,
      name: kalakritiEditionMembership.snapshotName,
      responsibility: kalakritiAssignment.responsibility,
    })
    .from(kalakritiEditionMembership)
    .leftJoin(
      kalakritiAssignment,
      and(
        eq(kalakritiAssignment.membershipId, kalakritiEditionMembership.id),
        eq(kalakritiAssignment.isPrimary, true)
      )
    )
    .where(
      and(
        eq(kalakritiEditionMembership.id, args.membershipId),
        eq(kalakritiEditionMembership.editionId, editionId)
      )
    )
    .limit(1);
  if (membership?.kind !== "volunteer") {
    throw new Error("Volunteer membership not found in this Edition");
  }
  const [active] = await tx
    .select({
      humanId: kalakritiCredential.humanId,
      id: kalakritiCredential.id,
    })
    .from(kalakritiCredential)
    .where(
      and(
        eq(kalakritiCredential.membershipId, args.membershipId),
        isNull(kalakritiCredential.revokedAt)
      )
    )
    .limit(1);
  if (active) {
    await revokeActiveCredential(tx, {
      actorUserId: args.actorUserId,
      credentialId: active.id,
      now: args.now,
    });
  }
  const humanId =
    membership.humanId ??
    active?.humanId ??
    (await allocateVolunteerHumanId(
      tx,
      edition,
      editionId,
      args.membershipId,
      args.now
    ));
  const { token, tokenHash } = createOpaqueCredentialToken();
  const credentialId = uuidv7();
  await tx.insert(kalakritiCredential).values({
    createdAt: new Date(args.now),
    editionId,
    humanId,
    id: credentialId,
    issuedAt: new Date(args.now),
    issuedBy: args.actorUserId,
    membershipId: args.membershipId,
    revokedAt: null,
    revokedBy: null,
    studentId: null,
    tokenHash,
  });
  return {
    card: {
      editionLabel: args.editionLabel,
      humanId,
      kind: "volunteer",
      name: membership.name,
      qrToken: token,
      scopeLabel: membership.responsibility
        ? KALAKRITI_RESPONSIBILITY_LABELS[membership.responsibility]
        : "Unassigned",
    },
    credentialId,
    humanId,
    subjectKind: "volunteer",
  };
}

export async function printKalakritiCredentials({
  actorUserId,
  editionId,
  editionLabel,
  now,
  subjects,
}: {
  actorUserId: string;
  editionId: string;
  editionLabel: string;
  now: number;
  subjects: readonly CredentialPrintSubject[];
}): Promise<Buffer> {
  for (const subject of subjects) {
    assertCredentialPrintSubject(subject);
  }
  // Load the PDF generator at runtime, outside the SSR bundle: react-pdf
  // resolves standard fonts through "#standard-fonts/*" package imports that
  // cannot resolve once bundled into the nitro output (CI/Linux).
  const { generateKalakritiCredentialPdf } = await import(
    /* @vite-ignore */ "@pi-dash/pdf/generate-kalakriti-credential"
  );

  const cards: CredentialCard[] = [];

  await db.transaction(async (tx) => {
    const [edition] = await tx
      .select({
        brandingKey: kalakritiEdition.brandingKey,
        lifecycle: kalakritiEdition.lifecycle,
        nextVolunteerSequence: kalakritiEdition.nextVolunteerSequence,
        year: kalakritiEdition.year,
      })
      .from(kalakritiEdition)
      .where(eq(kalakritiEdition.id, editionId))
      .for("update");
    if (!(edition && PRINTABLE_LIFECYCLES.has(edition.lifecycle))) {
      throw new Error("Printing is not allowed for this Edition");
    }
    const branding = resolveKalakritiCredentialBranding(edition.brandingKey);

    for (const subject of subjects) {
      let printed: PrintedCredentialResult;
      if (subject.studentId) {
        // biome-ignore lint/performance/noAwaitInLoops: credential writes must stay sequential per subject
        printed = await printStudentCredential(tx, editionId, {
          actorUserId,
          editionLabel,
          now,
          studentId: subject.studentId,
        });
      } else {
        printed = await printVolunteerCredential(tx, edition, editionId, {
          actorUserId,
          editionLabel,
          membershipId: subject.membershipId as string,
          now,
        });
      }
      await insertCredentialPrintAudit(tx, {
        actorUserId,
        credentialId: printed.credentialId,
        editionId,
        humanId: printed.humanId,
        now,
        subjectKind: printed.subjectKind,
      });
      cards.push(buildCredentialCard(branding, editionLabel, printed.card));
    }
  });

  return generateKalakritiCredentialPdf(cards);
}
