import {
  contributionChannelValues,
  contributionReportingModeValues,
  donationTypeValues,
  otherIncomeKindValues,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import {
  CONTRIBUTOR_ROLES,
  canGive,
  contributionRuleIssues,
  isContributionEditable,
  PLATFORM_INTERMEDIARY_PARTY_IDS,
  refundLockedChanges,
  todayInKolkata,
} from "@pi-dash/shared/income";
import { positivePaiseSchema } from "@pi-dash/shared/money";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import { type Schema, zql } from "../schema";
import {
  type LockableKalakritiTx,
  requireServerTransaction,
} from "./kalakriti-row-locks";

type Tx = Transaction<Schema>;

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

/** Calendar date, not in the future (India time). */
const receivedOn = z.iso
  .date()
  .refine((v) => v <= todayInKolkata(), "Date cannot be in the future");

const contributionFields = {
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
};

function refineContribution(
  value: Parameters<typeof contributionRuleIssues>[0],
  context: z.RefinementCtx
) {
  for (const issue of contributionRuleIssues(value)) {
    context.addIssue({
      code: "custom",
      message: issue.message,
      path: [issue.path],
    });
  }
}

export const contributionInputSchema = z
  .object(contributionFields)
  .superRefine(refineContribution);

/**
 * A new contribution, optionally recorded from a bank statement credit
 * ("Record as donation"): the line is then matched to it in the same
 * transaction, which also needs finance.manage.
 */
export const contributionCreateSchema = z
  .object({
    ...contributionFields,
    statementLineId: z.string().min(1).nullable().optional(),
  })
  .superRefine(refineContribution);

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
  const roles = await tx.run(
    zql.partyRole
      .where("partyId", partyId)
      .where("role", "IN", [...CONTRIBUTOR_ROLES])
      .where("active", true)
  );
  if (
    !canGive(
      partyId,
      roles.map((r) => r.role)
    )
  ) {
    if (PLATFORM_INTERMEDIARY_PARTY_IDS.includes(partyId)) {
      throw new Error(
        "GiveIndia is a donation platform, not a donor. Record the person who gave."
      );
    }
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

/**
 * Locks the contribution row on the server, so a refund the server applies
 * meanwhile (which locks it too) waits for this edit, and the refund check
 * below still holds when the edit is written. Linking a settlement line to
 * the contribution takes a key-share lock on this row (its foreign key), so
 * it waits too and the settled check holds as well.
 */
async function lockContribution(tx: Tx, id: string): Promise<void> {
  if (tx.location !== "server") {
    return;
  }
  const { sql } = await import("drizzle-orm");
  await requireServerTransaction(tx as unknown as LockableKalakritiTx).execute(
    sql`select 1 from contribution where id = ${id} for update`
  );
}

async function requireEditableContribution(tx: Tx, id: string) {
  await lockContribution(tx, id);
  const existing = await tx.run(zql.contribution.where("id", id).one());
  if (!existing) {
    throw new Error("Contribution not found");
  }
  if (!isContributionEditable(existing.status ?? "received")) {
    throw new Error("Only pending or received contributions can be changed");
  }
  const refund = await tx.run(
    zql.contributionRefund.where("contributionId", id).one()
  );
  // Razorpay paid its payment out to the bank: what it reported is fixed too.
  const settled = await tx.run(
    zql.gatewaySettlementItem
      .where("contributionId", id)
      .where("type", "payment")
      .whereExists("settlement", (s) => s.where("status", "processed"))
      .one()
  );
  return {
    existing,
    hasRefund: refund !== undefined,
    isSettled: settled !== undefined,
  };
}

/** Channels of money deposited straight into a bank account. */
const DIRECT_DEPOSIT_CHANNELS: readonly string[] = [
  "upi",
  "neft",
  "cheque",
  "cash",
];

/**
 * On the server, takes the lock every statement line write takes
 * (`STATEMENT_LINE_LOCK` in @pi-dash/db), so matching never races this.
 */
async function lockStatementLines(tx: Tx): Promise<void> {
  if (tx.location !== "server") {
    return;
  }
  const { sql } = await import("drizzle-orm");
  await requireServerTransaction(tx as unknown as LockableKalakritiTx).execute(
    sql`select pg_advisory_xact_lock(hashtext('statement-line-match'))`
  );
}

/**
 * The bank line a new contribution is recorded from: an unmatched credit of
 * the same amount into the same account. Checked on the server; the client
 * only applies the match optimistically when it has the line.
 */
async function requireRecordableLine(
  tx: Tx,
  lineId: string,
  values: { amountPaise: number; channel: string; orgAccountId: string | null }
) {
  await lockStatementLines(tx);
  const line = await tx.run(zql.statementLine.where("id", lineId).one());
  if (tx.location !== "server") {
    return line;
  }
  if (!line) {
    throw new Error("Bank statement line not found");
  }
  if (line.matchStatus !== "unmatched" || line.direction !== "credit") {
    throw new Error("This bank line is already matched or ignored");
  }
  if (line.amountPaise !== values.amountPaise) {
    throw new Error("The amount must equal the bank line's");
  }
  if (line.orgAccountId !== values.orgAccountId) {
    throw new Error("Deposited into must be the bank line's account");
  }
  if (!DIRECT_DEPOSIT_CHANNELS.includes(values.channel)) {
    throw new Error(
      "A donation in a bank statement came by UPI, NEFT, cheque or cash"
    );
  }
  return line;
}

/**
 * On the server: the bank line this contribution is matched to, if any,
 * read under the statement line lock, so a match made meanwhile is seen.
 */
async function matchedLine(tx: Tx, contributionId: string) {
  if (tx.location !== "server") {
    return undefined;
  }
  await lockStatementLines(tx);
  return await tx.run(
    zql.statementLine.where("matchedContributionId", contributionId).one()
  );
}

export const contributionMutators = {
  create: defineMutator(contributionCreateSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "donors.manage");
    if (args.statementLineId) {
      assertHasPermission(ctx, "finance.manage");
    }
    const { statementLineId, ...input } = args;
    const values = normalizeContribution(input);
    const line = statementLineId
      ? await requireRecordableLine(tx, statementLineId, values)
      : undefined;
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
    if (statementLineId && line) {
      await tx.mutate.statementLine.update({
        id: statementLineId,
        matchedAt: now,
        matchedBy: ctx.userId,
        matchedContributionId: args.id,
        matchKind: "contribution",
        matchReason: "manual",
        matchStatus: "matched",
        suggestedContributionId: null,
        suggestedKind: null,
        suggestedSettlementId: null,
        suggestionReason: null,
        updatedAt: now,
      });
    }
  }),

  delete: defineMutator(idInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "donors.manage");
    const { hasRefund, isSettled } = await requireEditableContribution(
      tx,
      args.id
    );
    if (hasRefund) {
      throw new Error("A contribution with a refund can't be deleted");
    }
    if (isSettled) {
      throw new Error(
        "Razorpay has settled this contribution to the bank, so it can't be deleted"
      );
    }
    if (await matchedLine(tx, args.id)) {
      throw new Error(
        "This contribution is matched to a bank statement line. Unmatch the line first."
      );
    }
    await tx.mutate.contribution.delete({ id: args.id });
  }),

  update: defineMutator(contributionInputSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "donors.manage");
    const { existing, hasRefund, isSettled } =
      await requireEditableContribution(tx, args.id);
    const values = normalizeContribution(args);
    if (hasRefund && refundLockedChanges(existing, values).length > 0) {
      throw new Error(
        "A refund is recorded against this contribution, so its amount, donor, date, account and channel can't change"
      );
    }
    if (isSettled && refundLockedChanges(existing, values).length > 0) {
      throw new Error(
        "Razorpay has settled this contribution to the bank, so its amount, donor, date, account and channel can't change"
      );
    }
    if (
      (values.amountPaise !== existing.amountPaise ||
        values.orgAccountId !== (existing.orgAccountId ?? null) ||
        !DIRECT_DEPOSIT_CHANNELS.includes(values.channel)) &&
      (await matchedLine(tx, args.id))
    ) {
      throw new Error(
        "This contribution is matched to a bank statement line, so its amount and account can't change and its channel stays UPI, NEFT, cheque or cash. Unmatch the line first."
      );
    }
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
