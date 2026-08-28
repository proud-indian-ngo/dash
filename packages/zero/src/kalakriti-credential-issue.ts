import { formatKalakritiVolunteerHumanId } from "@pi-dash/shared/kalakriti";
import {
  getEditionForUpdate,
  type LockableKalakritiTx,
  type LockedRegistrationEdition,
} from "./mutators/kalakriti-row-locks";
import { zql } from "./schema";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

export interface CredentialIssueTx extends LockableKalakritiTx {
  mutate: {
    kalakritiCredential: {
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiEdition: { update: ZeroMutationFn };
    kalakritiEditionMembership: { update: ZeroMutationFn };
  };
}

interface ActiveCredentialRow {
  humanId: string;
  id: string;
}

export async function findActiveCredentialForStudent(
  tx: { run: CredentialIssueTx["run"] },
  studentId: string
): Promise<ActiveCredentialRow | undefined> {
  return (await tx.run(
    zql.kalakritiCredential
      .where("studentId", studentId)
      .where("revokedAt", "IS", null)
      .one()
  )) as ActiveCredentialRow | undefined;
}

export async function findActiveCredentialForMembership(
  tx: { run: CredentialIssueTx["run"] },
  membershipId: string
): Promise<ActiveCredentialRow | undefined> {
  return (await tx.run(
    zql.kalakritiCredential
      .where("membershipId", membershipId)
      .where("revokedAt", "IS", null)
      .one()
  )) as ActiveCredentialRow | undefined;
}

async function resolveVolunteerHumanId(
  tx: CredentialIssueTx,
  edition: LockedRegistrationEdition,
  membershipId: string
): Promise<string> {
  const membership = (await tx.run(
    zql.kalakritiEditionMembership.where("id", membershipId).one()
  )) as { editionId: string; humanId: string | null } | undefined;
  if (!membership || membership.editionId !== edition.id) {
    throw new Error("Membership not found in this Edition");
  }
  if (membership.humanId) {
    return membership.humanId;
  }
  const humanId = formatKalakritiVolunteerHumanId(
    edition.year,
    edition.nextVolunteerSequence
  );
  await tx.mutate.kalakritiEditionMembership.update({
    humanId,
    id: membershipId,
  });
  await tx.mutate.kalakritiEdition.update({
    id: edition.id,
    nextVolunteerSequence: edition.nextVolunteerSequence + 1,
  });
  edition.nextVolunteerSequence += 1;
  return humanId;
}

export async function issueVolunteerCredential(
  tx: CredentialIssueTx,
  args: {
    actorUserId: string;
    credentialId: string;
    editionId: string;
    membershipId: string;
    now: number;
    tokenHash: string;
  }
): Promise<string> {
  const edition = await getEditionForUpdate(tx, args.editionId);
  if (!edition?.year || edition.nextVolunteerSequence === undefined) {
    throw new Error("Edition registration data is incomplete");
  }
  if (edition.lifecycle === "archived") {
    throw new Error("Edition is archived");
  }
  const humanId = await resolveVolunteerHumanId(
    tx,
    edition as LockedRegistrationEdition,
    args.membershipId
  );
  await tx.mutate.kalakritiCredential.insert({
    createdAt: args.now,
    editionId: args.editionId,
    humanId,
    id: args.credentialId,
    issuedAt: args.now,
    issuedBy: args.actorUserId,
    membershipId: args.membershipId,
    revokedAt: null,
    revokedBy: null,
    studentId: null,
    tokenHash: args.tokenHash,
  });
  return humanId;
}

export async function reissueCredential(
  tx: CredentialIssueTx,
  args: {
    actorUserId: string;
    credentialId: string;
    editionId: string;
    membershipId?: string;
    now: number;
    studentId?: string;
    tokenHash: string;
  }
): Promise<{ humanId: string; subjectKind: "student" | "volunteer" }> {
  const edition = await getEditionForUpdate(tx, args.editionId);
  if (!edition) {
    throw new Error("Edition not found");
  }
  if (edition.lifecycle === "archived") {
    throw new Error("Edition is archived");
  }

  if (args.studentId) {
    const student = (await tx.run(
      zql.kalakritiStudent.where("id", args.studentId).one()
    )) as { editionId: string; humanId: string } | undefined;
    if (!student || student.editionId !== args.editionId) {
      throw new Error("Student not found in this Edition");
    }
    const active = await findActiveCredentialForStudent(tx, args.studentId);
    if (active) {
      await tx.mutate.kalakritiCredential.update({
        id: active.id,
        revokedAt: args.now,
        revokedBy: args.actorUserId,
      });
    }
    await tx.mutate.kalakritiCredential.insert({
      createdAt: args.now,
      editionId: args.editionId,
      humanId: student.humanId,
      id: args.credentialId,
      issuedAt: args.now,
      issuedBy: args.actorUserId,
      membershipId: null,
      revokedAt: null,
      revokedBy: null,
      studentId: args.studentId,
      tokenHash: args.tokenHash,
    });
    return { humanId: student.humanId, subjectKind: "student" };
  }

  if (!args.membershipId) {
    throw new Error("Exactly one credential subject is required");
  }
  if (!edition.year || edition.nextVolunteerSequence === undefined) {
    throw new Error("Edition registration data is incomplete");
  }
  const membership = (await tx.run(
    zql.kalakritiEditionMembership.where("id", args.membershipId).one()
  )) as { editionId: string; humanId: string | null; kind: string } | undefined;
  if (!membership || membership.editionId !== args.editionId) {
    throw new Error("Membership not found in this Edition");
  }
  if (membership.kind !== "volunteer") {
    throw new Error("Guardians cannot receive Credentials");
  }
  const active = await findActiveCredentialForMembership(tx, args.membershipId);
  if (active) {
    await tx.mutate.kalakritiCredential.update({
      id: active.id,
      revokedAt: args.now,
      revokedBy: args.actorUserId,
    });
  }
  const humanId = active
    ? active.humanId
    : await resolveVolunteerHumanId(
        tx,
        edition as LockedRegistrationEdition,
        args.membershipId
      );
  await tx.mutate.kalakritiCredential.insert({
    createdAt: args.now,
    editionId: args.editionId,
    humanId,
    id: args.credentialId,
    issuedAt: args.now,
    issuedBy: args.actorUserId,
    membershipId: args.membershipId,
    revokedAt: null,
    revokedBy: null,
    studentId: null,
    tokenHash: args.tokenHash,
  });
  return { humanId, subjectKind: "volunteer" };
}
