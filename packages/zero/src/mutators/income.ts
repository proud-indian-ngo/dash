import {
  contributionChannelValues,
  contributionReportingModeValues,
  donationTypeValues,
  otherIncomeKindValues,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import {
  CONTRIBUTOR_ROLES,
  contributionRuleIssues,
  isContributionEditable,
  todayInKolkata,
} from "@pi-dash/shared/income";
import { positivePaiseSchema } from "@pi-dash/shared/money";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import { type Schema, zql } from "../schema";

type Tx = Transaction<Schema>;

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

/** Calendar date, not in the future (India time). */
const receivedOn = z.iso
  .date()
  .refine((v) => v <= todayInKolkata(), "Date cannot be in the future");

export const contributionInputSchema = z
  .object({
    amountPaise: positivePaiseSchema,
    channel: z.enum(contributionChannelValues),
    donationType: z.enum(donationTypeValues),
    donationTypeDescription: optionalText(200),
    fundId: z.string().min(1),
    id: z.string().min(1),
    inKindDescription: optionalText(500),
    inKindValuationBasis: optionalText(500),
    notes: optionalText(1000),
    orgAccountId: z.string().min(1).nullable().optional(),
    partyId: z.string().min(1),
    programmeId: z.string().min(1).nullable().optional(),
    projectId: z.string().min(1).nullable().optional(),
    receivedOn,
    reference: optionalText(120),
    reportingMode: z.enum(contributionReportingModeValues),
    reportingModeDescription: optionalText(200),
  })
  .superRefine((value, context) => {
    for (const issue of contributionRuleIssues(value)) {
      context.addIssue({
        code: "custom",
        message: issue.message,
        path: [issue.path],
      });
    }
  });

export type ContributionInput = z.infer<typeof contributionInputSchema>;

export const otherIncomeInputSchema = z.object({
  amountPaise: positivePaiseSchema,
  description: optionalText(500),
  fundId: z.string().min(1),
  id: z.string().min(1),
  kind: z.enum(otherIncomeKindValues),
  orgAccountId: z.string().min(1),
  receivedOn,
});

const idInput = z.object({ id: z.string().min(1) });

/** Zero stores Postgres `date` columns as epoch milliseconds at UTC midnight. */
function isoDateToEpoch(value: string): number {
  return new Date(`${value}T00:00:00Z`).getTime();
}

const orNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Only keep the fields the chosen channel, mode and type actually use. */
function normalizeContribution(args: ContributionInput) {
  const inKind = args.channel === "in_kind";
  return {
    amountPaise: args.amountPaise,
    channel: args.channel,
    donationType: args.donationType,
    donationTypeDescription:
      args.donationType === "other"
        ? orNull(args.donationTypeDescription)
        : null,
    fundId: args.fundId,
    inKindDescription: inKind ? orNull(args.inKindDescription) : null,
    inKindValuationBasis: inKind ? orNull(args.inKindValuationBasis) : null,
    notes: orNull(args.notes),
    orgAccountId: inKind ? null : (args.orgAccountId ?? null),
    partyId: args.partyId,
    programmeId: args.programmeId ?? null,
    projectId: args.projectId ?? null,
    receivedOn: isoDateToEpoch(args.receivedOn),
    reference: orNull(args.reference),
    reportingMode: args.reportingMode,
    reportingModeDescription:
      args.reportingMode === "other"
        ? orNull(args.reportingModeDescription)
        : null,
  };
}

/** A reference that is new or changed must be active; an unchanged one may since have been retired. */
function assertActive(
  row: { active: boolean | null } | undefined,
  label: string,
  unchanged: boolean
) {
  if (!row) {
    throw new Error(`${label} not found`);
  }
  if (!(unchanged || row.active)) {
    throw new Error(`${label} is not active`);
  }
}

async function assertContributor(tx: Tx, partyId: string) {
  const role = await tx.run(
    zql.partyRole
      .where("partyId", partyId)
      .where("role", "IN", [...CONTRIBUTOR_ROLES])
      .where("active", true)
      .one()
  );
  if (!role) {
    throw new Error(
      "Pick a party with an active donor, sponsor, grantor or intermediary role"
    );
  }
}

async function assertAccountAndFund(
  tx: Tx,
  next: { fundId: string; orgAccountId: string | null },
  previous?: { fundId: string; orgAccountId: string | null }
) {
  if (next.orgAccountId) {
    const account = await tx.run(
      zql.orgAccount.where("id", next.orgAccountId).one()
    );
    assertActive(
      account,
      "Account",
      previous?.orgAccountId === next.orgAccountId
    );
  }
  const fund = await tx.run(zql.fund.where("id", next.fundId).one());
  assertActive(fund, "Fund", previous?.fundId === next.fundId);
}

/**
 * A project fixes the programme: it must match when both are given, and fills
 * it in otherwise. The Unallocated holder is for spending, not gifts.
 */
async function resolveProgramme(
  tx: Tx,
  next: { programmeId: string | null; projectId: string | null },
  previous?: { programmeId: string | null; projectId: string | null }
): Promise<string | null> {
  let { programmeId } = next;
  if (next.projectId) {
    const project = await tx.run(zql.project.where("id", next.projectId).one());
    if (!project) {
      throw new Error("Project not found");
    }
    if (programmeId && programmeId !== project.programmeId) {
      throw new Error("The project belongs to a different programme");
    }
    programmeId = project.programmeId;
  }
  if (programmeId === PROGRAMME_IDS.unallocated) {
    throw new Error(
      "Choose a real programme, or leave it blank, not the Unallocated holder"
    );
  }
  if (programmeId) {
    const programme = await tx.run(
      zql.programme.where("id", programmeId).one()
    );
    assertActive(programme, "Programme", previous?.programmeId === programmeId);
  }
  return programmeId;
}

async function requireEditableContribution(tx: Tx, id: string) {
  const existing = await tx.run(zql.contribution.where("id", id).one());
  if (!existing) {
    throw new Error("Contribution not found");
  }
  if (!isContributionEditable(existing.status ?? "received")) {
    throw new Error("Only pending or received contributions can be changed");
  }
  return existing;
}

export const contributionMutators = {
  create: defineMutator(contributionInputSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "donors.manage");
    const values = normalizeContribution(args);
    if (tx.location === "server") {
      await assertContributor(tx, values.partyId);
      await assertAccountAndFund(tx, values);
      values.programmeId = await resolveProgramme(tx, values);
    }
    const now = Date.now();
    await tx.mutate.contribution.insert({
      ...values,
      createdAt: now,
      createdBy: ctx.userId,
      currency: "INR",
      deductionEligible: "unknown",
      gatewayFeePaise: 0,
      gatewayTaxPaise: 0,
      id: args.id,
      source: "manual",
      status: "received",
      updatedAt: now,
    });
  }),

  delete: defineMutator(idInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "donors.manage");
    await requireEditableContribution(tx, args.id);
    await tx.mutate.contribution.delete({ id: args.id });
  }),

  update: defineMutator(contributionInputSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "donors.manage");
    const existing = await requireEditableContribution(tx, args.id);
    const values = normalizeContribution(args);
    if (tx.location === "server") {
      if (values.partyId !== existing.partyId) {
        await assertContributor(tx, values.partyId);
      }
      await assertAccountAndFund(tx, values, existing);
      values.programmeId = await resolveProgramme(tx, values, existing);
    }
    await tx.mutate.contribution.update({
      ...values,
      id: args.id,
      updatedAt: Date.now(),
    });
  }),
};

export const otherIncomeMutators = {
  create: defineMutator(otherIncomeInputSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    if (tx.location === "server") {
      await assertAccountAndFund(tx, args);
    }
    const now = Date.now();
    await tx.mutate.otherIncome.insert({
      amountPaise: args.amountPaise,
      createdAt: now,
      createdBy: ctx.userId,
      description: orNull(args.description),
      fundId: args.fundId,
      id: args.id,
      kind: args.kind,
      orgAccountId: args.orgAccountId,
      receivedOn: isoDateToEpoch(args.receivedOn),
      updatedAt: now,
    });
  }),

  delete: defineMutator(idInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(zql.otherIncome.where("id", args.id).one());
    if (!existing) {
      throw new Error("Income not found");
    }
    await tx.mutate.otherIncome.delete({ id: args.id });
  }),

  update: defineMutator(otherIncomeInputSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(zql.otherIncome.where("id", args.id).one());
    if (!existing) {
      throw new Error("Income not found");
    }
    if (tx.location === "server") {
      await assertAccountAndFund(tx, args, existing);
    }
    await tx.mutate.otherIncome.update({
      amountPaise: args.amountPaise,
      description: orNull(args.description),
      fundId: args.fundId,
      id: args.id,
      kind: args.kind,
      orgAccountId: args.orgAccountId,
      receivedOn: isoDateToEpoch(args.receivedOn),
      updatedAt: Date.now(),
    });
  }),
};
