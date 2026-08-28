import { createHash, randomBytes } from "node:crypto";
import { db } from "@pi-dash/db";
import {
  kalakritiAssignment,
  kalakritiCenter,
  kalakritiCredential,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { generateKalakritiCredentialPdf } from "@pi-dash/pdf/generate-kalakriti-credential";
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

function createOpaqueCredentialToken(): { token: string; tokenHash: string } {
  const tokenBytes = randomBytes(32);
  return {
    token: tokenBytes.toString("base64url"),
    tokenHash: createHash("sha256").update(tokenBytes).digest("hex"),
  };
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

export interface CredentialPrintSubject {
  membershipId?: string;
  studentId?: string;
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
): Promise<
  Omit<
    CredentialCard,
    "accentColor" | "backgroundColor" | "textColor" | "wordmark"
  >
> {
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
    editionLabel: args.editionLabel,
    humanId: student.humanId,
    kind: "student",
    name: student.name,
    qrToken: token,
    scopeLabel: student.centerName,
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
): Promise<
  Omit<
    CredentialCard,
    "accentColor" | "backgroundColor" | "textColor" | "wordmark"
  >
> {
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
    editionLabel: args.editionLabel,
    humanId,
    kind: "volunteer",
    name: membership.name,
    qrToken: token,
    scopeLabel: membership.responsibility
      ? KALAKRITI_RESPONSIBILITY_LABELS[membership.responsibility]
      : "Unassigned",
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
      if (!(subject.studentId || subject.membershipId)) {
        throw new Error("Exactly one credential subject is required");
      }
      let card: Omit<
        CredentialCard,
        "accentColor" | "backgroundColor" | "textColor" | "wordmark"
      >;
      if (subject.studentId) {
        // biome-ignore lint/performance/noAwaitInLoops: credential writes must stay sequential per subject
        card = await printStudentCredential(tx, editionId, {
          actorUserId,
          editionLabel,
          now,
          studentId: subject.studentId,
        });
      } else {
        card = await printVolunteerCredential(tx, edition, editionId, {
          actorUserId,
          editionLabel,
          membershipId: subject.membershipId as string,
          now,
        });
      }
      cards.push(buildCredentialCard(branding, editionLabel, card));
    }
  });

  return generateKalakritiCredentialPdf(cards);
}
