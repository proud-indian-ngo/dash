import {
  grantDonationTypeValues,
  grantStatusValues,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import { grantLinkIssue } from "@pi-dash/shared/grants";
import { GIVER_ROLES } from "@pi-dash/shared/income";
import { paiseSchema, positivePaiseSchema } from "@pi-dash/shared/money";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import { type Schema, zql } from "../schema";
import { assertBudgetableHeads } from "./budget";
import {
  claimUploadedR2ObjectKey,
  createR2ClaimOptions,
  enqueueDeleteR2Object,
} from "./submission-helpers";

type Tx = Transaction<Schema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable();

/** Zero stores Postgres `date` columns as epoch milliseconds at UTC midnight. */
const isoDateToEpoch = (value: string) =>
  new Date(`${value}T00:00:00Z`).getTime();

const orNull = (value: string | null) => value?.trim() || null;

const saveInput = z
  .object({
    agreementOn: z.iso.date().nullable(),
    agreementReference: optionalText(120),
    donationType: z.enum(grantDonationTypeValues),
    endsOn: z.iso.date(),
    id: z.string().min(1),
    notes: optionalText(1000),
    partyId: z.string().min(1),
    programmeId: z.string().min(1),
    projectId: z.string().min(1),
    sanctionedPaise: positivePaiseSchema,
    scheduleViiItem: optionalText(200),
    startsOn: z.iso.date(),
    status: z.enum(grantStatusValues),
    title: z.string().trim().min(1).max(200),
  })
  .refine((v) => v.endsOn >= v.startsOn, {
    message: "The grant can't end before it starts",
    path: ["endsOn"],
  });

const tranchesInput = z.object({
  grantId: z.string().min(1),
  tranches: z.array(
    z.object({
      amountPaise: positivePaiseSchema,
      expectedOn: z.iso.date(),
      id: z.string().min(1),
      note: optionalText(200),
    })
  ),
});

const budgetInput = z.object({
  grantId: z.string().min(1),
  /** One line per budgeted expense head; a head left out has no budget. */
  lines: z
    .array(
      z.object({
        accountHeadId: z.string(),
        amountPaise: paiseSchema,
        id: z.string(),
      })
    )
    .refine(
      (lines) =>
        new Set(lines.map((l) => l.accountHeadId)).size === lines.length,
      "Each account head appears once"
    ),
});

async function requireGrant(tx: Tx, id: string) {
  const grant = await tx.run(zql.grantAgreement.where("id", id).one());
  if (!grant) {
    throw new Error("Grant not found");
  }
  return grant;
}

/** The grantor gives in its own right: an active donor, sponsor or grantor role. */
async function assertGrantor(tx: Tx, partyId: string) {
  const role = await tx.run(
    zql.partyRole
      .where("partyId", partyId)
      .where("role", "IN", [...GIVER_ROLES])
      .where("active", true)
      .one()
  );
  if (!role) {
    throw new Error(
      "Pick a grantor with an active donor, sponsor or grantor role"
    );
  }
}

const agreementKeyPrefix = (grantId: string) =>
  `attachments/grants/${grantId}/`;

export const grantMutators = {
  /** Creates or edits a grant. Its grantor, programme and project stay while contributions are linked. */
  save: defineMutator(saveInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(
      zql.grantAgreement.where("id", args.id).one()
    );
    const project = await tx.run(zql.project.where("id", args.projectId).one());
    if (!project || project.programmeId !== args.programmeId) {
      throw new Error("Project not found under this programme");
    }
    const moved =
      !existing ||
      existing.projectId !== args.projectId ||
      existing.programmeId !== args.programmeId;
    if (moved) {
      const programme = await tx.run(
        zql.programme.where("id", args.programmeId).one()
      );
      if (!programme?.active || programme.id === PROGRAMME_IDS.unallocated) {
        throw new Error("Pick an active programme, not Unallocated");
      }
    }
    // A project may have several grants, never two at once; the database's
    // exclusion constraint backs this up.
    const overlapping = await tx.run(
      zql.grantAgreement
        .where("projectId", args.projectId)
        .where("id", "!=", args.id)
        .where("startsOn", "<=", isoDateToEpoch(args.endsOn))
        .where("endsOn", ">=", isoDateToEpoch(args.startsOn))
        .one()
    );
    if (overlapping) {
      throw new Error(
        `"${overlapping.title}" already funds this project in these dates. A project's grants can't overlap.`
      );
    }
    if (existing && (moved || existing.partyId !== args.partyId)) {
      const linked = await tx.run(
        zql.contribution.where("grantId", args.id).one()
      );
      if (linked) {
        throw new Error(
          "Contributions are linked to this grant, so its grantor, programme and project can't change. Unlink them first."
        );
      }
    }
    if (
      tx.location === "server" &&
      (!existing || existing.partyId !== args.partyId)
    ) {
      await assertGrantor(tx, args.partyId);
    }

    const values = {
      agreementOn: args.agreementOn ? isoDateToEpoch(args.agreementOn) : null,
      agreementReference: orNull(args.agreementReference),
      donationType: args.donationType,
      endsOn: isoDateToEpoch(args.endsOn),
      notes: orNull(args.notes),
      partyId: args.partyId,
      programmeId: args.programmeId,
      projectId: args.projectId,
      sanctionedPaise: args.sanctionedPaise,
      scheduleViiItem: orNull(args.scheduleViiItem),
      startsOn: isoDateToEpoch(args.startsOn),
      status: args.status,
      title: args.title,
      updatedAt: Date.now(),
    };
    if (existing) {
      await tx.mutate.grantAgreement.update({ id: args.id, ...values });
    } else {
      await tx.mutate.grantAgreement.insert({
        ...values,
        agreementFilename: null,
        agreementMimeType: null,
        agreementObjectKey: null,
        createdAt: values.updatedAt,
        id: args.id,
      });
    }
  }),

  /** Removes a grant with nothing linked to it, with its tranches, budget and agreement. */
  delete: defineMutator(
    z.object({ id: z.string().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "finance.manage");
      const grant = await requireGrant(tx, args.id);
      if (await tx.run(zql.contribution.where("grantId", args.id).one())) {
        throw new Error(
          "Contributions are linked to this grant. Unlink them before deleting it."
        );
      }
      for (const tranche of await tx.run(
        zql.grantTranche.where("grantId", args.id)
      )) {
        await tx.mutate.grantTranche.delete({ id: tranche.id });
      }
      for (const line of await tx.run(
        zql.grantBudgetLine.where("grantId", args.id)
      )) {
        await tx.mutate.grantBudgetLine.delete({ id: line.id });
      }
      await tx.mutate.grantAgreement.delete({ id: args.id });
      enqueueDeleteR2Object(ctx, tx.location, grant.agreementObjectKey, {
        keyPrefixes: [agreementKeyPrefix(args.id)],
        meta: { grantId: args.id, mutator: "grant.delete" },
      });
    }
  ),

  /**
   * Replaces the expected tranches. Contributions linked to a removed
   * tranche stay linked to the grant, without a tranche.
   */
  saveTranches: defineMutator(tranchesInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    await requireGrant(tx, args.grantId);
    const current = await tx.run(
      zql.grantTranche.where("grantId", args.grantId)
    );
    const kept = new Map(args.tranches.map((t) => [t.id, t]));
    for (const tranche of current) {
      if (kept.has(tranche.id)) {
        continue;
      }
      for (const gift of await tx.run(
        zql.contribution.where("grantTrancheId", tranche.id)
      )) {
        await tx.mutate.contribution.update({
          grantTrancheId: null,
          id: gift.id,
          updatedAt: Date.now(),
        });
      }
      await tx.mutate.grantTranche.delete({ id: tranche.id });
    }
    const standing = new Set(current.map((t) => t.id));
    for (const tranche of args.tranches) {
      const values = {
        amountPaise: tranche.amountPaise,
        expectedOn: isoDateToEpoch(tranche.expectedOn),
        id: tranche.id,
        note: orNull(tranche.note),
      };
      if (standing.has(tranche.id)) {
        await tx.mutate.grantTranche.update(values);
      } else {
        await tx.mutate.grantTranche.insert({
          ...values,
          grantId: args.grantId,
        });
      }
    }
  }),

  /** Sets the grant's budget by expense head, replacing its lines. ₹0 is a budget; a head left out has none. */
  saveBudget: defineMutator(budgetInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    await requireGrant(tx, args.grantId);
    const current = await tx.run(
      zql.grantBudgetLine.where("grantId", args.grantId)
    );
    await assertBudgetableHeads(
      tx,
      args.lines.map((l) => l.accountHeadId),
      current.map((l) => l.accountHeadId)
    );
    const byHead = new Map(current.map((l) => [l.accountHeadId, l]));
    const kept = new Set(args.lines.map((l) => l.accountHeadId));
    for (const line of current) {
      if (!kept.has(line.accountHeadId)) {
        await tx.mutate.grantBudgetLine.delete({ id: line.id });
      }
    }
    for (const line of args.lines) {
      const standing = byHead.get(line.accountHeadId);
      if (!standing) {
        await tx.mutate.grantBudgetLine.insert({
          accountHeadId: line.accountHeadId,
          amountPaise: line.amountPaise,
          grantId: args.grantId,
          id: line.id,
        });
      } else if (standing.amountPaise !== line.amountPaise) {
        await tx.mutate.grantBudgetLine.update({
          amountPaise: line.amountPaise,
          id: standing.id,
        });
      }
    }
  }),

  /** Attaches, replaces or removes the signed agreement. */
  setAgreement: defineMutator(
    z.object({
      agreement: z
        .object({
          filename: z.string().min(1).max(255),
          mimeType: z.string().min(1),
          objectKey: z.string().min(1),
        })
        .nullable(),
      grantId: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "finance.manage");
      const grant = await requireGrant(tx, args.grantId);
      const objectKey = args.agreement
        ? claimUploadedR2ObjectKey(
            args.agreement.objectKey,
            createR2ClaimOptions(ctx, tx.location, {
              durablePrefix: `grants/${args.grantId}`,
              mimeType: args.agreement.mimeType,
              subfolder: "attachments",
            })
          )
        : null;
      await tx.mutate.grantAgreement.update({
        agreementFilename: args.agreement?.filename ?? null,
        agreementMimeType: args.agreement?.mimeType ?? null,
        agreementObjectKey: objectKey,
        id: args.grantId,
        updatedAt: Date.now(),
      });
      if (grant.agreementObjectKey !== objectKey) {
        enqueueDeleteR2Object(ctx, tx.location, grant.agreementObjectKey, {
          keyPrefixes: [agreementKeyPrefix(args.grantId)],
          meta: { grantId: args.grantId, mutator: "grant.setAgreement" },
        });
      }
    }
  ),

  /**
   * Counts a contribution towards a grant, optionally against one of its
   * tranches, or (with no grant) takes it off. Only the grantor's
   * contributions on the grant's programme and project, not reversed.
   */
  linkContribution: defineMutator(
    z.object({
      contributionId: z.string().min(1),
      grantId: z.string().min(1).nullable(),
      trancheId: z.string().min(1).nullable(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "finance.manage");
      const gift = await tx.run(
        zql.contribution.where("id", args.contributionId).one()
      );
      if (!gift) {
        throw new Error("Contribution not found");
      }
      if (!args.grantId) {
        await tx.mutate.contribution.update({
          grantId: null,
          grantTrancheId: null,
          id: gift.id,
          updatedAt: Date.now(),
        });
        return;
      }
      const grant = await requireGrant(tx, args.grantId);
      const issue = grantLinkIssue(
        {
          channel: gift.channel,
          partyId: gift.partyId,
          programmeId: gift.programmeId ?? null,
          projectId: gift.projectId ?? null,
          status: gift.status,
        },
        grant
      );
      if (issue) {
        throw new Error(issue);
      }
      if (args.trancheId) {
        const tranche = await tx.run(
          zql.grantTranche
            .where("id", args.trancheId)
            .where("grantId", args.grantId)
            .one()
        );
        if (!tranche) {
          throw new Error("Tranche not found on this grant");
        }
      }
      await tx.mutate.contribution.update({
        grantId: args.grantId,
        grantTrancheId: args.trancheId,
        id: gift.id,
        updatedAt: Date.now(),
      });
    }
  ),
};
