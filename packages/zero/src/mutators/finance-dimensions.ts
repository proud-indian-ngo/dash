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
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import { type Schema, zql } from "../schema";

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

export const costCentreMutators = {
  create: defineMutator(costCentreInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
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
      active: args.active ?? existing.active ?? true,
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
 * Accounts are never deleted: contributions and other income point at them,
 * so an account that is no longer used is deactivated through update.
 */
export const orgAccountMutators = {
  create: defineMutator(orgAccountInputSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    await assertNameFree(tx, args);
    const now = Date.now();
    const fundSource = args.fundSource ?? "domestic";
    await tx.mutate.orgAccount.insert({
      active: args.active ?? true,
      createdAt: now,
      fcraRole: fcraRoleFor(fundSource, args.fcraRole ?? "none"),
      fundSource,
      id: args.id,
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
    const fundSource = args.fundSource ?? existing.fundSource ?? "domestic";
    await tx.mutate.orgAccount.update({
      active: args.active ?? existing.active ?? true,
      fcraRole: fcraRoleFor(
        fundSource,
        args.fcraRole ?? existing.fcraRole ?? "none"
      ),
      fundSource,
      id: args.id,
      kind: args.kind,
      name: args.name,
      updatedAt: Date.now(),
    });
  }),
};
