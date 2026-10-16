import {
  accountHeadTypeValues,
  LEDGER_ACCOUNT_HEAD_IDS,
  type FcraRole,
  fcraRoleValues,
  type FundSource,
  fundRestrictionValues,
  fundSourceValues,
  MAX_PAISE,
  orgAccountKindValues,
  PROGRAMME_IDS,
  projectKindValues,
  projectStatusValues,
} from "@pi-dash/shared/constants";
import { DEPRECATED_PUBLIC_CITY_ALIASES } from "@pi-dash/shared/cost-centre";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import { type Schema, zql } from "../schema";
import {
  type LockableKalakritiTx,
  requireServerTransaction,
} from "./kalakriti-row-locks";

const code = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[A-Z0-9_-]+$/, "Use upper-case letters, digits, - or _");
const name = z.string().trim().min(1).max(120);
const paise = z.number().int().nonnegative().max(MAX_PAISE);
const isoDate = z.iso.date();

const programmeInput = z.object({
  active: z.boolean().optional(),
  cause: z.string().trim().max(60).nullable().optional(),
  code,
  description: z.string().trim().max(500).nullable().optional(),
  financeThresholdPaise: paise.nullable().optional(),
  id: z.string(),
  leadUserId: z.string().nullable().optional(),
  name,
  sortOrder: z.number().int().optional(),
});

const projectInput = z
  .object({
    code,
    description: z.string().trim().max(500).nullable().optional(),
    endsOn: isoDate.nullable().optional(),
    id: z.string(),
    kind: z.enum(projectKindValues).optional(),
    name,
    programmeId: z.string(),
    quotedBudgetPaise: paise.nullable().optional(),
    reportDueOn: isoDate.nullable().optional(),
    startsOn: isoDate.nullable().optional(),
    status: z.enum(projectStatusValues).optional(),
  })
  .refine(
    (v) => !(v.startsOn && v.endsOn) || v.endsOn >= v.startsOn,
    "End date must be on or after the start date"
  );

const fundInput = z.object({
  active: z.boolean().optional(),
  code,
  description: z.string().trim().max(500).nullable().optional(),
  id: z.string(),
  name,
  restriction: z.enum(fundRestrictionValues).optional(),
  source: z.enum(fundSourceValues).optional(),
});

const costCentreInput = z.object({
  active: z.boolean().optional(),
  code,
  id: z.string(),
  name,
  stateUt: z.string().trim().max(60).nullable().optional(),
});

const accountHeadInput = z.object({
  active: z.boolean().optional(),
  code,
  description: z.string().trim().max(500).nullable().optional(),
  id: z.string(),
  name,
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  tallyLedgerName: z.string().trim().max(120).nullable().optional(),
  type: z.enum(accountHeadTypeValues),
});

export const orgAccountInputSchema = z.object({
  active: z.boolean().optional(),
  fcraRole: z.enum(fcraRoleValues).optional(),
  fundSource: z.enum(fundSourceValues).optional(),
  id: z.string(),
  /** The main bank account, which expenses are paid from (layer 3-3a). */
  isMain: z.boolean().optional(),
  kind: z.enum(orgAccountKindValues),
  name,
});

/** Zero stores Postgres `date` columns as epoch milliseconds at UTC midnight. */
function isoDateToEpoch(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ms = new Date(`${value}T00:00:00Z`).getTime();
  if (
    !Number.isFinite(ms) ||
    new Date(ms).toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Invalid date");
  }
  return ms;
}

type Tx = Transaction<Schema>;

type Lookups = {
  byCode: () => Promise<unknown>;
  byName: () => Promise<unknown>;
};

async function assertCodeAndNameFree(
  args: { code: string; name: string },
  lookups: Lookups
) {
  if (await lookups.byCode()) {
    throw new Error(`Code ${args.code} is already used`);
  }
  if (await lookups.byName()) {
    throw new Error(`Name "${args.name}" is already used`);
  }
}

async function assertNameFree(tx: Tx, args: { id: string; name: string }) {
  const byName = await tx.run(
    zql.orgAccount.where("name", args.name).where("id", "!=", args.id).one()
  );
  if (byName) {
    throw new Error(`Name "${args.name}" is already used`);
  }
}

async function assertLeadEligible(tx: Tx, leadUserId: string | null) {
  if (!leadUserId) {
    return;
  }
  const lead = await tx.run(zql.user.where("id", leadUserId).one());
  if (!lead || lead.role === "external_user" || lead.banned) {
    throw new Error("Programme lead must be an active internal user");
  }
}

async function requireProgramme(tx: Tx, id: string) {
  const programme = await tx.run(zql.programme.where("id", id).one());
  if (!programme) {
    throw new Error("Programme not found");
  }
  return programme;
}

/** The parent must exist, share the head's type, and not lead back to the head. */
async function assertParentHead(
  tx: Tx,
  args: { id: string; parentId: string | null; type: string }
) {
  if (!args.parentId) {
    return;
  }
  if (args.parentId === args.id) {
    throw new Error("An account head cannot be its own parent");
  }
  const seen = new Set<string>([args.id]);
  let cursor: string | null = args.parentId;
  while (cursor) {
    if (seen.has(cursor)) {
      throw new Error("Account head parents form a cycle");
    }
    seen.add(cursor);
    const parent: { parentId: string | null; type: string } | undefined =
      await tx.run(zql.accountHead.where("id", cursor).one());
    if (!parent) {
      throw new Error("Parent account head not found");
    }
    if (parent.type !== args.type) {
      throw new Error("Parent account head must have the same type");
    }
    cursor = parent.parentId;
  }
}

export const programmeMutators = {
  create: defineMutator(programmeInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    await assertCodeAndNameFree(args, {
      byCode: () =>
        tx.run(
          zql.programme
            .where("code", args.code)
            .where("id", "!=", args.id)
            .one()
        ),
      byName: () =>
        tx.run(
          zql.programme
            .where("name", args.name)
            .where("id", "!=", args.id)
            .one()
        ),
    });
    await assertLeadEligible(tx, args.leadUserId ?? null);
    const now = Date.now();
    await tx.mutate.programme.insert({
      active: args.active ?? true,
      cause: args.cause ?? null,
      code: args.code,
      createdAt: now,
      description: args.description ?? null,
      financeThresholdPaise: args.financeThresholdPaise ?? null,
      id: args.id,
      leadUserId: args.leadUserId ?? null,
      name: args.name,
      sortOrder: args.sortOrder ?? 0,
      updatedAt: now,
    });
  }),
  update: defineMutator(programmeInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(zql.programme.where("id", args.id).one());
    if (!existing) {
      throw new Error("Programme not found");
    }
    const active = args.active ?? existing.active ?? true;
    if (args.id === PROGRAMME_IDS.unallocated && !active) {
      throw new Error(
        "The Unallocated holding programme cannot be deactivated"
      );
    }
    await assertCodeAndNameFree(args, {
      byCode: () =>
        tx.run(
          zql.programme
            .where("code", args.code)
            .where("id", "!=", args.id)
            .one()
        ),
      byName: () =>
        tx.run(
          zql.programme
            .where("name", args.name)
            .where("id", "!=", args.id)
            .one()
        ),
    });
    await assertLeadEligible(
      tx,
      args.leadUserId === undefined ? existing.leadUserId : args.leadUserId
    );
    await tx.mutate.programme.update({
      active,
      cause: args.cause === undefined ? existing.cause : args.cause,
      code: args.code,
      description:
        args.description === undefined
          ? existing.description
          : args.description,
      financeThresholdPaise:
        args.financeThresholdPaise === undefined
          ? existing.financeThresholdPaise
          : args.financeThresholdPaise,
      id: args.id,
      leadUserId:
        args.leadUserId === undefined ? existing.leadUserId : args.leadUserId,
      name: args.name,
      sortOrder: args.sortOrder ?? existing.sortOrder ?? 0,
      updatedAt: Date.now(),
    });
  }),
};

/** A project with expenses charged to it keeps its programme. */
async function assertNoChargedExpenses(tx: Tx, projectId: string) {
  const [reimbursement, vendorPayment] = await Promise.all([
    tx.run(zql.reimbursement.where("chargedProjectId", projectId).one()),
    tx.run(zql.vendorPayment.where("chargedProjectId", projectId).one()),
  ]);
  if (reimbursement || vendorPayment) {
    throw new Error(
      "Expenses are charged to this project, so it can't move to another programme. Change what those expenses are charged to first."
    );
  }
}

export const projectMutators = {
  create: defineMutator(projectInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const programme = await requireProgramme(tx, args.programmeId);
    if (!programme.active) {
      throw new Error("Projects cannot be added to an inactive programme");
    }
    if (args.programmeId === PROGRAMME_IDS.unallocated) {
      throw new Error("Choose a real programme, not the Unallocated holder");
    }
    const byCode = await tx.run(
      zql.project.where("code", args.code).where("id", "!=", args.id).one()
    );
    if (byCode) {
      throw new Error(`Code ${args.code} is already used`);
    }
    const now = Date.now();
    await tx.mutate.project.insert({
      code: args.code,
      createdAt: now,
      description: args.description ?? null,
      endsOn: isoDateToEpoch(args.endsOn),
      id: args.id,
      intermediaryPartyId: null,
      kind: args.kind ?? "other",
      name: args.name,
      programmeId: args.programmeId,
      quotedBudgetPaise: args.quotedBudgetPaise ?? null,
      reportDueOn: isoDateToEpoch(args.reportDueOn),
      sponsorPartyId: null,
      startsOn: isoDateToEpoch(args.startsOn),
      status: args.status ?? "active",
      updatedAt: now,
    });
  }),
  update: defineMutator(projectInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(zql.project.where("id", args.id).one());
    if (!existing) {
      throw new Error("Project not found");
    }
    if (existing.programmeId !== args.programmeId) {
      const programme = await requireProgramme(tx, args.programmeId);
      if (!programme.active) {
        throw new Error("Projects cannot be moved to an inactive programme");
      }
      // Expenses charged to the project name its programme too, so moving
      // it would split them from it.
      await assertNoChargedExpenses(tx, args.id);
    }
    const byCode = await tx.run(
      zql.project.where("code", args.code).where("id", "!=", args.id).one()
    );
    if (byCode) {
      throw new Error(`Code ${args.code} is already used`);
    }
    await tx.mutate.project.update({
      code: args.code,
      description:
        args.description === undefined
          ? existing.description
          : args.description,
      endsOn:
        args.endsOn === undefined
          ? existing.endsOn
          : isoDateToEpoch(args.endsOn),
      id: args.id,
      kind: args.kind ?? existing.kind,
      name: args.name,
      programmeId: args.programmeId,
      quotedBudgetPaise:
        args.quotedBudgetPaise === undefined
          ? existing.quotedBudgetPaise
          : args.quotedBudgetPaise,
      reportDueOn:
        args.reportDueOn === undefined
          ? existing.reportDueOn
          : isoDateToEpoch(args.reportDueOn),
      startsOn:
        args.startsOn === undefined
          ? existing.startsOn
          : isoDateToEpoch(args.startsOn),
      status: args.status ?? existing.status,
      updatedAt: Date.now(),
    });
  }),
};

export const fundMutators = {
  create: defineMutator(fundInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    await assertCodeAndNameFree(args, {
      byCode: () =>
        tx.run(
          zql.fund.where("code", args.code).where("id", "!=", args.id).one()
        ),
      byName: () =>
        tx.run(
          zql.fund.where("name", args.name).where("id", "!=", args.id).one()
        ),
    });
    const now = Date.now();
    await tx.mutate.fund.insert({
      active: args.active ?? true,
      code: args.code,
      createdAt: now,
      description: args.description ?? null,
      grantAgreementId: null,
      id: args.id,
      name: args.name,
      restriction: args.restriction ?? "unrestricted",
      source: args.source ?? "domestic",
      updatedAt: now,
    });
  }),
  update: defineMutator(fundInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(zql.fund.where("id", args.id).one());
    if (!existing) {
      throw new Error("Fund not found");
    }
    await assertCodeAndNameFree(args, {
      byCode: () =>
        tx.run(
          zql.fund.where("code", args.code).where("id", "!=", args.id).one()
        ),
      byName: () =>
        tx.run(
          zql.fund.where("name", args.name).where("id", "!=", args.id).one()
        ),
    });
    await tx.mutate.fund.update({
      active: args.active ?? existing.active ?? true,
      code: args.code,
      description:
        args.description === undefined
          ? existing.description
          : args.description,
      id: args.id,
      name: args.name,
      restriction: args.restriction ?? existing.restriction,
      source: args.source ?? existing.source,
      updatedAt: Date.now(),
    });
  }),
};

/** Codes the public feed reads as aliases of BLR can't name a cost centre. */
const RESERVED_COST_CENTRE_CODES = new Set(
  Object.keys(DEPRECATED_PUBLIC_CITY_ALIASES).map((alias) =>
    alias.toUpperCase()
  )
);

/** On the server, locks the active cost centres to the end of the transaction. */
async function lockActiveCostCentres(tx: Tx): Promise<void> {
  if (tx.location !== "server") {
    return;
  }
  const [{ costCentre }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/finance-dimensions"),
    import("drizzle-orm"),
  ]);
  await requireServerTransaction(tx as unknown as LockableKalakritiTx)
    .select({ id: costCentre.id })
    .from(costCentre)
    .where(eq(costCentre.active, true))
    .for("update");
}

export const costCentreMutators = {
  create: defineMutator(costCentreInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    if (RESERVED_COST_CENTRE_CODES.has(args.code)) {
      throw new Error(
        `Code ${args.code} is reserved: the website's events feed reads it as Bangalore`
      );
    }
    await assertCodeAndNameFree(args, {
      byCode: () =>
        tx.run(
          zql.costCentre
            .where("code", args.code)
            .where("id", "!=", args.id)
            .one()
        ),
      byName: () =>
        tx.run(
          zql.costCentre
            .where("name", args.name)
            .where("id", "!=", args.id)
            .one()
        ),
    });
    const now = Date.now();
    await tx.mutate.costCentre.insert({
      active: args.active ?? true,
      code: args.code,
      createdAt: now,
      id: args.id,
      name: args.name,
      stateUt: args.stateUt ?? null,
      updatedAt: now,
    });
  }),
  update: defineMutator(costCentreInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(zql.costCentre.where("id", args.id).one());
    if (!existing) {
      throw new Error("Cost centre not found");
    }
    // The code is what the public events feed and the website use, and
    // records point at the centre, so it never changes once created.
    if (args.code !== existing.code) {
      throw new Error("A cost centre's code can't be changed");
    }
    const active = args.active ?? existing.active ?? true;
    if (existing.active !== false && !active) {
      // Two deactivations at once must not both see the other as active.
      await lockActiveCostCentres(tx);
      const others = await tx.run(
        zql.costCentre.where("active", true).where("id", "!=", args.id)
      );
      if (others.length === 0) {
        throw new Error("At least one cost centre must stay active");
      }
    }
    await assertCodeAndNameFree(args, {
      byCode: () =>
        tx.run(
          zql.costCentre
            .where("code", args.code)
            .where("id", "!=", args.id)
            .one()
        ),
      byName: () =>
        tx.run(
          zql.costCentre
            .where("name", args.name)
            .where("id", "!=", args.id)
            .one()
        ),
    });
    await tx.mutate.costCentre.update({
      active,
      code: args.code,
      id: args.id,
      name: args.name,
      stateUt: args.stateUt === undefined ? existing.stateUt : args.stateUt,
      updatedAt: Date.now(),
    });
  }),
};

const LEDGER_REFERENCE_HEAD_IDS = new Set<string>(
  Object.values(LEDGER_ACCOUNT_HEAD_IDS)
);

/**
 * A head the books use (one of the reference heads, or any head a ledger
 * entry posts under) keeps its type and stays active: changing either would
 * silently move posted amounts between income, expenditure and the balance
 * summary. The ledger check runs on the server, where every entry is
 * visible.
 */
async function assertHeadKeepsBooks(
  tx: Tx,
  existing: { active: boolean | null; id: string; type: string },
  args: { active?: boolean | undefined; type: string }
) {
  const changesType = args.type !== existing.type;
  const deactivates = args.active === false && existing.active !== false;
  if (!(changesType || deactivates)) {
    return;
  }
  let used = LEDGER_REFERENCE_HEAD_IDS.has(existing.id);
  if (!used && tx.location === "server") {
    used =
      (await tx.run(
        zql.ledgerEntry.where("accountHeadId", existing.id).one()
      )) !== undefined;
  }
  if (used) {
    throw new Error(
      changesType
        ? "This account head is used by the books, so its type can't change"
        : "This account head is used by the books, so it can't be deactivated"
    );
  }
}

export const accountHeadMutators = {
  create: defineMutator(accountHeadInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    await assertCodeAndNameFree(args, {
      byCode: () =>
        tx.run(
          zql.accountHead
            .where("code", args.code)
            .where("id", "!=", args.id)
            .one()
        ),
      byName: () =>
        tx.run(
          zql.accountHead
            .where("name", args.name)
            .where("id", "!=", args.id)
            .one()
        ),
    });
    await assertParentHead(tx, {
      id: args.id,
      parentId: args.parentId ?? null,
      type: args.type,
    });
    const now = Date.now();
    await tx.mutate.accountHead.insert({
      active: args.active ?? true,
      code: args.code,
      createdAt: now,
      description: args.description ?? null,
      id: args.id,
      name: args.name,
      parentId: args.parentId ?? null,
      sortOrder: args.sortOrder ?? 0,
      tallyLedgerName: args.tallyLedgerName ?? null,
      type: args.type,
      updatedAt: now,
    });
  }),
  update: defineMutator(accountHeadInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(zql.accountHead.where("id", args.id).one());
    if (!existing) {
      throw new Error("Account head not found");
    }
    await assertHeadKeepsBooks(tx, existing, args);
    await assertCodeAndNameFree(args, {
      byCode: () =>
        tx.run(
          zql.accountHead
            .where("code", args.code)
            .where("id", "!=", args.id)
            .one()
        ),
      byName: () =>
        tx.run(
          zql.accountHead
            .where("name", args.name)
            .where("id", "!=", args.id)
            .one()
        ),
    });
    const parentId =
      args.parentId === undefined ? existing.parentId : args.parentId;
    await assertParentHead(tx, { id: args.id, parentId, type: args.type });
    await tx.mutate.accountHead.update({
      active: args.active ?? existing.active ?? true,
      code: args.code,
      description:
        args.description === undefined
          ? existing.description
          : args.description,
      id: args.id,
      name: args.name,
      parentId,
      sortOrder: args.sortOrder ?? existing.sortOrder ?? 0,
      tallyLedgerName:
        args.tallyLedgerName === undefined
          ? existing.tallyLedgerName
          : args.tallyLedgerName,
      type: args.type,
      updatedAt: Date.now(),
    });
  }),
};

/** An FCRA role only means something on an FCRA account; domestic ones store none. */
function fcraRoleFor(fundSource: FundSource, fcraRole: FcraRole): FcraRole {
  return fundSource === "fcra" ? fcraRole : "none";
}

/**
 * The main bank account: only an active bank account, and only one. Marking
 * another one main unmarks the old one in the same transaction.
 */
async function applyMainAccount(
  tx: Tx,
  account: { active: boolean; id: string; isMain: boolean; kind: string },
  now: number
) {
  if (!account.isMain) {
    return;
  }
  if (account.kind !== "bank" || !account.active) {
    throw new Error("Only an active bank account can be the main account");
  }
  const others = await tx.run(
    zql.orgAccount.where("isMain", true).where("id", "!=", account.id)
  );
  for (const other of others) {
    await tx.mutate.orgAccount.update({
      id: other.id,
      isMain: false,
      updatedAt: now,
    });
  }
}

/**
 * Accounts are never deleted: contributions and other income point at them,
 * so an account that is no longer used is deactivated through update.
 */
export const orgAccountMutators = {
  create: defineMutator(orgAccountInputSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    await assertNameFree(tx, args);
    const now = Date.now();
    const fundSource = args.fundSource ?? "domestic";
    const active = args.active ?? true;
    const isMain = args.isMain ?? false;
    await applyMainAccount(
      tx,
      { active, id: args.id, isMain, kind: args.kind },
      now
    );
    await tx.mutate.orgAccount.insert({
      active,
      createdAt: now,
      fcraRole: fcraRoleFor(fundSource, args.fcraRole ?? "none"),
      fundSource,
      id: args.id,
      isMain,
      kind: args.kind,
      name: args.name,
      updatedAt: now,
    });
  }),
  update: defineMutator(orgAccountInputSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(zql.orgAccount.where("id", args.id).one());
    if (!existing) {
      throw new Error("Organisation account not found");
    }
    await assertNameFree(tx, args);
    const now = Date.now();
    const fundSource = args.fundSource ?? existing.fundSource ?? "domestic";
    const active = args.active ?? existing.active ?? true;
    // Deactivating the main account, or making it another kind, unmarks it
    // unless the form asked to keep it main (which is then refused).
    const isMain =
      args.isMain ??
      ((existing.isMain ?? false) && active && args.kind === "bank");
    await applyMainAccount(
      tx,
      { active, id: args.id, isMain, kind: args.kind },
      now
    );
    await tx.mutate.orgAccount.update({
      active,
      fcraRole: fcraRoleFor(
        fundSource,
        args.fcraRole ?? existing.fcraRole ?? "none"
      ),
      fundSource,
      id: args.id,
      isMain,
      kind: args.kind,
      name: args.name,
      updatedAt: now,
    });
  }),
};
