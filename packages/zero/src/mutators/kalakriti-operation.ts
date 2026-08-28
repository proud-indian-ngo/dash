import {
  KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
  type KalakritiOperationType,
} from "@pi-dash/shared/kalakriti";
import { hashKalakritiCredentialToken } from "@pi-dash/shared/kalakriti-credential";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import {
  assertCanRecordOperation,
  findExistingOperationByOperationId,
  getOperationSubjectKind,
  type KalakritiOperationRecord,
} from "../kalakriti-operation-rules";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import {
  getEditionForUpdate,
  type LockableKalakritiTx,
} from "./kalakriti-row-locks";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

interface OperationTx extends LockableKalakritiTx {
  mutate: {
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiOperation: { insert: ZeroMutationFn };
  };
}

const kalakritiOperationTypeSchema = z.enum([
  "pickup",
  "venue_departure",
  "drop_off",
  "volunteer_check_in",
  "breakfast",
  "lunch",
  "competition_attendance",
]);

const kalakritiOperationRecordBaseSchema = z.object({
  auditEntryId: z.string(),
  editionId: z.string(),
  id: z.string(),
  now: z.number(),
  occurredAt: z.number(),
  operationId: z.string(),
  sessionId: z.string().optional(),
  type: kalakritiOperationTypeSchema,
});

export const kalakritiOperationRecordSchema =
  kalakritiOperationRecordBaseSchema.extend({
    credentialToken: z.string().min(1),
  });

export const kalakritiOperationRecordManualSchema =
  kalakritiOperationRecordBaseSchema.extend({
    humanId: z.string().min(1),
  });

interface ActiveMembership {
  id: string;
  kind: "guardian" | "volunteer";
}

async function getActiveMembership(
  tx: LockableKalakritiTx,
  ctx: Context,
  editionId: string
): Promise<ActiveMembership | undefined> {
  return (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("state", "active")
      .one()
  )) as ActiveMembership | undefined;
}

export async function assertCanRecordKalakritiOperation(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }
  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }
  if (membership.kind === "guardian") {
    throw new Error("Unauthorized");
  }

  const editionAdmin = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where("responsibility", "edition_admin")
      .one()
  );
  if (editionAdmin) {
    return;
  }

  const transportLead = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where("responsibility", "transport_lead")
      .one()
  );
  if (transportLead) {
    return;
  }

  const foodLead = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where("responsibility", "food_lead")
      .one()
  );
  if (foodLead) {
    return;
  }

  const hospitalityLead = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where("responsibility", "hospitality_lead")
      .one()
  );
  if (hospitalityLead) {
    return;
  }

  const centerLiaison = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where(({ or, cmp }) =>
        or(
          ...KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES.map(
            (responsibility) => cmp("responsibility", responsibility)
          )
        )
      )
      .one()
  );
  if (centerLiaison) {
    return;
  }

  const competitionStaff = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where(({ or, cmp }) =>
        or(
          cmp("responsibility", "competition_volunteer"),
          cmp("responsibility", "competition_coordinator")
        )
      )
      .one()
  );
  if (competitionStaff) {
    return;
  }

  throw new Error("Unauthorized");
}

async function loadSubjectOperations(
  tx: OperationTx,
  editionId: string,
  subject: { membershipId?: string | null; studentId?: string | null }
): Promise<KalakritiOperationRecord[]> {
  if (subject.studentId) {
    return (await tx.run(
      zql.kalakritiOperation
        .where("editionId", editionId)
        .where("studentId", subject.studentId)
    )) as KalakritiOperationRecord[];
  }
  if (subject.membershipId) {
    return (await tx.run(
      zql.kalakritiOperation
        .where("editionId", editionId)
        .where("membershipId", subject.membershipId)
    )) as KalakritiOperationRecord[];
  }
  return [];
}

async function resolveSubjectFromCredential(
  tx: OperationTx,
  editionId: string,
  credentialToken: string
): Promise<{ membershipId: string | null; studentId: string | null }> {
  const tokenHash = await hashKalakritiCredentialToken(credentialToken);
  const credential = (await tx.run(
    zql.kalakritiCredential
      .where("tokenHash", tokenHash)
      .where("revokedAt", "IS", null)
      .one()
  )) as
    | {
        editionId: string;
        membershipId: string | null;
        studentId: string | null;
      }
    | undefined;
  if (!credential || credential.editionId !== editionId) {
    throw new Error("Credential not found or revoked");
  }
  return {
    membershipId: credential.membershipId,
    studentId: credential.studentId,
  };
}

async function resolveSubjectFromHumanId(
  tx: OperationTx,
  editionId: string,
  humanId: string
): Promise<{ membershipId: string | null; studentId: string | null }> {
  const student = (await tx.run(
    zql.kalakritiStudent
      .where("editionId", editionId)
      .where("humanId", humanId)
      .one()
  )) as { id: string } | undefined;
  if (student) {
    return { membershipId: null, studentId: student.id };
  }
  const membership = (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("humanId", humanId)
      .one()
  )) as { id: string } | undefined;
  if (membership) {
    return { membershipId: membership.id, studentId: null };
  }
  throw new Error("Yearly ID not found in this Edition");
}

async function recordKalakritiOperation(
  tx: OperationTx,
  ctx: Context,
  args: {
    auditEntryId: string;
    editionId: string;
    id: string;
    now: number;
    occurredAt: number;
    operationId: string;
    sessionId?: string;
    subject: { membershipId: string | null; studentId: string | null };
    type: KalakritiOperationType;
  }
): Promise<void> {
  const edition = await getEditionForUpdate(tx, args.editionId);
  if (!edition) {
    throw new Error("Edition not found");
  }
  if (edition.lifecycle === "archived") {
    throw new Error("Edition is archived");
  }
  await assertCanRecordKalakritiOperation(tx, ctx, args.editionId);

  const existing = (await tx.run(
    zql.kalakritiOperation.where("operationId", args.operationId).one()
  )) as KalakritiOperationRecord | undefined;
  if (existing) {
    if (existing.editionId !== args.editionId) {
      return;
    }
    return;
  }

  const subjectOperations = await loadSubjectOperations(
    tx,
    args.editionId,
    args.subject
  );
  if (findExistingOperationByOperationId(subjectOperations, args.operationId)) {
    return;
  }

  assertCanRecordOperation(
    subjectOperations,
    args.type,
    args.subject,
    args.sessionId ?? null
  );

  await tx.mutate.kalakritiOperation.insert({
    competitionSessionId: args.sessionId ?? null,
    correctionReason: null,
    createdAt: args.now,
    editionId: args.editionId,
    id: args.id,
    membershipId: args.subject.membershipId,
    occurredAt: args.occurredAt,
    operationId: args.operationId,
    recordedBy: ctx.userId,
    studentId: args.subject.studentId,
    supersededByOperationId: null,
    type: args.type,
  });

  await tx.mutate.kalakritiAuditEntry.insert({
    action: "recorded",
    actorUserId: ctx.userId,
    createdAt: args.now,
    domain: "event_day_operation",
    editionId: args.editionId,
    id: args.auditEntryId,
    metadata: {
      operationId: args.operationId,
      subjectKind: getOperationSubjectKind(args.subject),
      type: args.type,
    },
    reason: null,
    targetId: args.id,
    targetType: "event_day_operation",
  });
}

export const kalakritiOperationMutators = {
  record: defineMutator(
    kalakritiOperationRecordSchema,
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const subject = await resolveSubjectFromCredential(
        tx as OperationTx,
        args.editionId,
        args.credentialToken
      );
      await recordKalakritiOperation(tx as OperationTx, ctx, {
        auditEntryId: args.auditEntryId,
        editionId: args.editionId,
        id: args.id,
        now: args.now,
        occurredAt: args.occurredAt,
        operationId: args.operationId,
        sessionId: args.sessionId,
        subject,
        type: args.type,
      });
    }
  ),

  recordManual: defineMutator(
    kalakritiOperationRecordManualSchema,
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const subject = await resolveSubjectFromHumanId(
        tx as OperationTx,
        args.editionId,
        args.humanId
      );
      await recordKalakritiOperation(tx as OperationTx, ctx, {
        auditEntryId: args.auditEntryId,
        editionId: args.editionId,
        id: args.id,
        now: args.now,
        occurredAt: args.occurredAt,
        operationId: args.operationId,
        sessionId: args.sessionId,
        subject,
        type: args.type,
      });
    }
  ),
};
