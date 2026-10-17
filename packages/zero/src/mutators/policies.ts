import {
  POLICY_SUMMARY_MAX,
  POLICY_TITLE_MAX,
  policyAudienceValues,
} from "@pi-dash/shared/declarations";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission, assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";

/**
 * The policy register: governance adds policies and
 * publishes versions from approved documents in the vault; everyone
 * acknowledges the versions meant for them.
 */

const isoDate = z.iso.date();

/** Zero stores dates as epoch milliseconds at UTC midnight. */
const toEpoch = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export const policyMutators = {
  create: defineMutator(
    z.object({
      audience: z.enum(policyAudienceValues),
      description: z.string().trim().max(POLICY_SUMMARY_MAX).nullable(),
      id: z.string(),
      title: z.string().trim().min(1).max(POLICY_TITLE_MAX),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const now = Date.now();
      await tx.mutate.policy.insert({
        audience: args.audience,
        createdAt: now,
        description: args.description,
        gatesChildren: false,
        id: args.id,
        key: null,
        title: args.title,
        updatedAt: now,
      });
    }
  ),
  /** A new version from the approved document in the vault; it applies from its date. */
  publishVersion: defineMutator(
    z.object({
      documentId: z.string(),
      effectiveOn: isoDate,
      id: z.string(),
      policyId: z.string(),
      summary: z.string().trim().max(POLICY_SUMMARY_MAX).nullable(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const row = await tx.run(zql.policy.where("id", args.policyId).one());
      if (!row) {
        throw new Error("Policy not found");
      }
      const document = await tx.run(
        zql.governanceDocument.where("id", args.documentId).one()
      );
      if (!document) {
        throw new Error("The document isn't in the vault");
      }
      if (document.kind !== "policy") {
        throw new Error("Choose a document filed as a policy.");
      }
      const latest = await tx.run(
        zql.policyVersion
          .where("policyId", args.policyId)
          .orderBy("version", "desc")
          .one()
      );
      if (latest && toEpoch(args.effectiveOn) <= latest.effectiveOn) {
        throw new Error("A new version takes effect after the one before it.");
      }
      await tx.mutate.policyVersion.insert({
        documentId: args.documentId,
        effectiveOn: toEpoch(args.effectiveOn),
        id: args.id,
        policyId: args.policyId,
        publishedAt: Date.now(),
        publishedBy: ctx.userId,
        summary: args.summary,
        version: (latest?.version ?? 0) + 1,
      });
      await tx.mutate.policy.update({ id: row.id, updatedAt: Date.now() });
    }
  ),
};

export const policyAcknowledgementMutators = {
  /** The signed-in person has read a version and will follow it. */
  acknowledge: defineMutator(
    z.object({ id: z.string(), policyVersionId: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const version = await tx.run(
        zql.policyVersion.where("id", args.policyVersionId).one()
      );
      if (!version) {
        throw new Error("Policy version not found");
      }
      const existing = await tx.run(
        zql.policyAcknowledgement
          .where("policyVersionId", args.policyVersionId)
          .where("userId", ctx.userId)
          .one()
      );
      if (existing) {
        return;
      }
      await tx.mutate.policyAcknowledgement.insert({
        acknowledgedAt: Date.now(),
        id: args.id,
        policyVersionId: args.policyVersionId,
        userId: ctx.userId,
      });
    }
  ),
};
