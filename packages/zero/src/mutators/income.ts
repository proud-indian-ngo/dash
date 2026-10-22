import {
  type ContributionChannel,
  contributionChannelValues,
  contributionReportingModeValues,
  type DeductionEligible,
  deductionEligibleValues,
  donationTypeValues,
  otherIncomeKindValues,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import {
  type ChannelAccountSetup,
  channelAccountIssue,
  keepsFixedAccount,
  RAZORPAY_CLEARING_ACCOUNT_CONFIG_KEY,
} from "@pi-dash/shared/contribution-channel";
import {
  donationTypeFundIssue,
  donationTypeProgrammeIssue,
} from "@pi-dash/shared/contribution-programme";
import { ELIGIBILITY_REASON_MAX } from "@pi-dash/shared/donations-return";
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
import {
  DIRECT_RECEIPT_CHANNELS,
  RECEIPTING_START_DAY,
} from "@pi-dash/shared/receipts";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import { type Context, requireEnqueue } from "../context";
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
  /**
   * Tax certificate: unknown follows the donor's choice, yes includes the
   * gift in the donations return, no excludes it with a reason. Left out,
   * an update keeps the stored choice. A classification field, so it stays
   * editable under refund, settlement and bank-line locks.
   */
  deductionEligible: z.enum(deductionEligibleValues).optional(),
  donationType: z.enum(donationTypeValues),
  donationTypeDescription: optionalText(200),
  eligibilityReason: optionalText(ELIGIBILITY_REASON_MAX),
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

/** The tax certificate choice to store; a reason is kept only for an exclusion. */
function normalizeEligibility(
  args: Pick<ContributionInput, "deductionEligible" | "eligibilityReason">,
  current: {
    deductionEligible: string;
    eligibilityReason: string | null;
  } | null
): { deductionEligible: DeductionEligible; eligibilityReason: string | null } {
  if (args.deductionEligible === undefined) {
    return current
      ? {
          deductionEligible: current.deductionEligible as DeductionEligible,
          eligibilityReason: current.eligibilityReason,
        }
      : { deductionEligible: "unknown", eligibilityReason: null };
  }
  return {
    deductionEligible: args.deductionEligible,
    eligibilityReason:
      args.deductionEligible === "no" ? orNull(args.eligibilityReason) : null,
  };
}

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

/** The Razorpay clearing account chosen in Settings, if any. */
async function readChannelSetup(tx: Tx): Promise<ChannelAccountSetup> {
  const row = await tx.run(
    zql.appConfig.where("key", RAZORPAY_CLEARING_ACCOUNT_CONFIG_KEY).one()
  );
  return { razorpayClearingAccountId: row?.value || null };
}

async function assertAccountAndFund(
  tx: Tx,
  next: { fundId: string; orgAccountId: string | null },
  previous?: { fundId: string; orgAccountId: string | null },
  options: {
    /** The gift's channel: the account must fit it (`channelAccountIssue`). */
    donation?: { channel: ContributionChannel; keepAccount?: boolean };
  } = {}
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
    // A fixed deposit gets money only by transfer, never a donation.
    if (options.donation && account?.kind === "deposit") {
      throw new Error("A donation can't be deposited into a fixed deposit");
    }
    if (account && options.donation && !options.donation.keepAccount) {
      const issue = channelAccountIssue(
        options.donation.channel,
        account,
        await readChannelSetup(tx)
      );
      if (issue) {
        throw new Error(issue);
      }
    }
  }
  const fund = await tx.run(zql.fund.where("id", next.fundId).one());
  assertActive(fund, "Fund", previous?.fundId === next.fundId);
}

/** A specific grant or CSR gift names its programme; a corpus gift has none. */
function assertProgrammeFitsType(values: {
  donationType: ContributionInput["donationType"];
  programmeId: string | null;
  projectId: string | null;
}) {
  const issue = donationTypeProgrammeIssue(values);
  if (issue) {
    throw new Error(issue);
  }
}

/**
 * The corpus type decides the fund: a corpus gift goes to the Corpus Fund
 * and stays there, and only a corpus gift goes there. A gift recorded
 * against another fund before the rule is held to it when next edited.
 */
function assertFundFitsType(values: {
  donationType: ContributionInput["donationType"];
  fundId: string;
}) {
  const issue = donationTypeFundIssue(values);
  if (issue) {
    throw new Error(issue);
  }
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

/** What a filed gift's frozen row reported, so it can't change after filing. */
const FILING_LOCKED_FIELDS = [
  "amountPaise",
  "partyId",
  "receivedOn",
  "channel",
  "reportingMode",
  "donationType",
] as const;

/**
 * What a live receipt printed or decided from the gift (with the tax
 * certificate choice; the mode of receipt decides whether a cash gift
 * carries the 80G line): changing any of them would leave the receipt
 * wrong, or send it to someone else, so it is voided first. The programme
 * is compared on the server, once a project has resolved it.
 */
const RECEIPT_LOCKED_FIELDS = [
  ...FILING_LOCKED_FIELDS,
  "donationTypeDescription",
  "projectId",
  "reference",
] as const;

/** Stored text may carry spaces or be empty where the form sends null. */
function sameValue(stored: unknown, next: unknown): boolean {
  const normal = (value: unknown) =>
    typeof value === "string" ? value.trim() || null : (value ?? null);
  return normal(stored) === normal(next);
}

async function assertReceiptUnchanged(
  tx: Tx,
  id: string,
  changed: boolean
): Promise<void> {
  if (
    changed &&
    (await tx.run(
      zql.contributionReceipt
        .where("contributionId", id)
        .where("voidedAt", "IS", null)
        .one()
    ))
  ) {
    throw new Error(
      "A receipt was issued for this gift, so its donor, amount, date, channel, mode of receipt, donation type, reference, programme, project and tax certificate choice can't change. Void the receipt first."
    );
  }
}

/**
 * The live donations return filing holding the gift, if any (server only:
 * filings are private). Its frozen row points at the gift, so the gift and
 * what the row reported stay.
 */
async function filingOfGift(
  tx: Tx,
  id: string
): Promise<{ sequence: number; status: string } | null> {
  if (tx.location !== "server") {
    return null;
  }
  const { sql } = await import("drizzle-orm");
  const rows = (await requireServerTransaction(
    tx as unknown as LockableKalakritiTx
  ).execute(
    sql`select f.sequence, f.status from private.donation_filing_gift g join private.donation_filing f on f.id = g.filing_id where g.contribution_id = ${id}`
  )) as unknown as { sequence: number; status: string }[];
  return rows[0] ?? null;
}

/** Why a filed gift can't change: discard a filing not yet uploaded, else revise on the portal. */
function filedGiftMessage(
  filing: { sequence: number; status: string },
  action: string
): string {
  return filing.status === "prepared"
    ? `This gift is in filing ${filing.sequence}, which isn't uploaded yet, so it ${action}. Discard that filing first.`
    : `This gift is in donations return filing ${filing.sequence}, so it ${action}. Correct it with a revision on the portal.`;
}

async function requireEditableContribution(tx: Tx, id: string) {
  // Lock order: the statement line lock before the contribution row, as
  // matching and the line actions take them (advisory lock, then the row's
  // key-share lock through the line's foreign key). The other order could
  // deadlock against them.
  await lockStatementLines(tx);
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
 * On the server: the bank line this contribution is matched to, if any.
 * Callers hold the statement line lock (taken first by
 * `requireEditableContribution`), so a match made meanwhile is seen.
 */
async function matchedLine(tx: Tx, contributionId: string) {
  if (tx.location !== "server") {
    return undefined;
  }
  return await tx.run(
    zql.statementLine.where("matchedContributionId", contributionId).one()
  );
}

/**
 * After the commit, brings the record into the books (finance layer 3-2):
 * the `ledger-post-source` job posts, reverses or reposts it on the server.
 * Keyed by source, so repeated edits collapse into one queued job.
 */
function queueLedgerPosting(
  ctx: Context,
  tx: Tx,
  source: { sourceId: string; sourceType: "contribution" | "other_income" },
  mutator: string
) {
  if (tx.location !== "server") {
    return;
  }
  ctx.asyncTasks?.push({
    fn: async () => {
      await requireEnqueue(ctx)("ledger-post-source", source, {
        singletonKey: `${source.sourceType}:${source.sourceId}`,
        traceId: ctx.traceId,
      });
    },
    meta: { mutator, ...source },
  });
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
      await assertAccountAndFund(tx, values, undefined, {
        donation: { channel: values.channel },
      });
      values.programmeId = await resolveProgramme(tx, values);
    }
    assertProgrammeFitsType(values);
    assertFundFitsType(values);
    const now = Date.now();
    await tx.mutate.contribution.insert({
      ...values,
      createdAt: now,
      createdBy: ctx.userId,
      currency: "INR",
      ...normalizeEligibility(args, null),
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
    if (
      tx.location === "server" &&
      DIRECT_RECEIPT_CHANNELS.includes(values.channel) &&
      args.receivedOn >= RECEIPTING_START_DAY
    ) {
      const { inTransaction } = await import("@pi-dash/jobs/enqueue");
      await requireEnqueue(ctx)(
        "issue-contribution-receipt",
        { actorId: ctx.userId, contributionId: args.id },
        {
          db: inTransaction(
            requireServerTransaction(tx as unknown as LockableKalakritiTx)
          ),
          singletonKey: args.id,
          traceId: ctx.traceId,
        }
      );
    }
    queueLedgerPosting(
      ctx,
      tx,
      { sourceId: args.id, sourceType: "contribution" },
      "contribution.create"
    );
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
    // Receipt numbers are never reused, so a gift any receipt was issued
    // for (voided ones too) stays, keeping its receipt's history whole.
    if (
      await tx.run(
        zql.contributionReceipt.where("contributionId", args.id).one()
      )
    ) {
      throw new Error(
        "A receipt was issued for this gift; it can't be deleted"
      );
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
    const filing = await filingOfGift(tx, args.id);
    if (filing) {
      throw new Error(filedGiftMessage(filing, "can't be deleted"));
    }
    await tx.mutate.contribution.delete({ id: args.id });
    queueLedgerPosting(
      ctx,
      tx,
      { sourceId: args.id, sourceType: "contribution" },
      "contribution.delete"
    );
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
    const eligibility = normalizeEligibility(args, {
      deductionEligible: existing.deductionEligible ?? "unknown",
      eligibilityReason: existing.eligibilityReason ?? null,
    });
    // A filed gift's row is frozen: what the return reported stays as filed.
    if (
      FILING_LOCKED_FIELDS.some(
        (field) => (existing[field] ?? null) !== (values[field] ?? null)
      ) ||
      eligibility.deductionEligible !==
        (existing.deductionEligible ?? "unknown")
    ) {
      const filing = await filingOfGift(tx, args.id);
      if (filing) {
        throw new Error(
          filedGiftMessage(
            filing,
            "can't change its amount, donor, date, channel, mode of receipt, donation type or tax certificate choice"
          )
        );
      }
    }
    await assertReceiptUnchanged(
      tx,
      args.id,
      RECEIPT_LOCKED_FIELDS.some(
        (field) => !sameValue(existing[field], values[field])
      ) ||
        eligibility.deductionEligible !==
          (existing.deductionEligible ?? "unknown")
    );
    if (existing.grantId && values.channel === "in_kind") {
      throw new Error(
        "This contribution counts towards a grant, and grants count money, not in-kind gifts. Ask finance to unlink it from the grant first."
      );
    }
    if (
      existing.grantId &&
      (values.partyId !== existing.partyId ||
        values.projectId !== (existing.projectId ?? null))
    ) {
      throw new Error(
        "This contribution counts towards a grant, so its donor and project can't change. Ask finance to unlink it from the grant first."
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
      // A refund or a processed settlement fixes the channel and account,
      // so a gift recorded before the channel rules keeps its account.
      await assertAccountAndFund(tx, values, existing, {
        donation: {
          channel: values.channel,
          keepAccount: keepsFixedAccount(
            hasRefund || isSettled,
            values,
            existing
          ),
        },
      });
      // An edit that leaves the project and programme alone keeps the
      // stored programme, even if the project now derives another.
      if (
        sameValue(existing.projectId, values.projectId) &&
        sameValue(existing.programmeId, values.programmeId)
      ) {
        values.programmeId = existing.programmeId ?? null;
      } else {
        values.programmeId = await resolveProgramme(tx, values, existing);
        await assertReceiptUnchanged(
          tx,
          args.id,
          !sameValue(existing.programmeId, values.programmeId)
        );
      }
    }
    assertProgrammeFitsType(values);
    assertFundFitsType(values);
    await tx.mutate.contribution.update({
      ...values,
      ...eligibility,
      id: args.id,
      updatedAt: Date.now(),
    });
    queueLedgerPosting(
      ctx,
      tx,
      { sourceId: args.id, sourceType: "contribution" },
      "contribution.update"
    );
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
    queueLedgerPosting(
      ctx,
      tx,
      { sourceId: args.id, sourceType: "other_income" },
      "otherIncome.create"
    );
  }),

  delete: defineMutator(idInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(zql.otherIncome.where("id", args.id).one());
    if (!existing) {
      throw new Error("Income not found");
    }
    await tx.mutate.otherIncome.delete({ id: args.id });
    queueLedgerPosting(
      ctx,
      tx,
      { sourceId: args.id, sourceType: "other_income" },
      "otherIncome.delete"
    );
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
    queueLedgerPosting(
      ctx,
      tx,
      { sourceId: args.id, sourceType: "other_income" },
      "otherIncome.update"
    );
  }),
};
