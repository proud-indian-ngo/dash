import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import {
  type CredentialIssueTx,
  reissueCredential,
} from "../kalakriti-credential-issue";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

interface CredentialTx {
  location: "client" | "server";
  mutate: {
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiCredential: {
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiEdition: { update: ZeroMutationFn };
    kalakritiEditionMembership: { update: ZeroMutationFn };
  };
  run: (query: unknown) => Promise<unknown>;
}

export const kalakritiCredentialReissueSchema = z
  .object({
    auditEntryId: z.string(),
    credentialId: z.string(),
    editionId: z.string(),
    membershipId: z.string().optional(),
    now: z.number(),
    studentId: z.string().optional(),
    tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .refine((value) => Boolean(value.studentId) !== Boolean(value.membershipId), {
    message: "Exactly one credential subject is required",
  });

async function assertCanManageCredentials(
  tx: CredentialTx,
  ctx: Context | undefined,
  editionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }
  const membership = (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("state", "active")
      .one()
  )) as { id: string } | undefined;
  if (!membership) {
    throw new Error("Unauthorized");
  }
  const adminAssignment = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where("responsibility", "edition_admin")
      .one()
  );
  if (!adminAssignment) {
    throw new Error("Unauthorized");
  }
}

export const kalakritiCredentialMutators = {
  reissue: defineMutator(
    kalakritiCredentialReissueSchema,
    async ({ tx, ctx, args }) => {
      await assertCanManageCredentials(tx as never, ctx, args.editionId);
      assertIsLoggedIn(ctx);
      const result = await reissueCredential(tx as CredentialIssueTx, {
        actorUserId: ctx.userId,
        credentialId: args.credentialId,
        editionId: args.editionId,
        membershipId: args.membershipId,
        now: args.now,
        studentId: args.studentId,
        tokenHash: args.tokenHash,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "reissued",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "credential",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: {
          humanId: result.humanId,
          subjectKind: result.subjectKind,
        },
        reason: null,
        targetId: args.credentialId,
        targetType: "credential",
      });
    }
  ),
};
