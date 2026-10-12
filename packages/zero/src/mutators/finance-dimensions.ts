import {
  accountHeadTypeValues,
  fcraRoleValues,
  fundRestrictionValues,
  fundSourceValues,
  orgAccountKindValues,
  projectKindValues,
  projectStatusValues,
} from "@pi-dash/shared/constants";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

const code = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[A-Z0-9_-]+$/, "Use upper-case letters, digits, - or _");
const name = z.string().trim().min(1).max(120);
const paise = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const programmeInput = z.object({
  active: z.boolean().optional(),
  cause: z.string().trim().max(60).optional(),
  code,
  description: z.string().trim().max(500).optional(),
  financeThresholdPaise: paise.nullable().optional(),
  id: z.string(),
  leadUserId: z.string().nullable().optional(),
  name,
  sortOrder: z.number().int().optional(),
});

const projectInput = z.object({
  code,
  description: z.string().trim().max(500).optional(),
  endsOn: isoDate.nullable().optional(),
  id: z.string(),
  kind: z.enum(projectKindValues).optional(),
  name,
  programmeId: z.string(),
  quotedBudgetPaise: paise.nullable().optional(),
  reportDueOn: isoDate.nullable().optional(),
  startsOn: isoDate.nullable().optional(),
  status: z.enum(projectStatusValues).optional(),
});

const fundInput = z.object({
  active: z.boolean().optional(),
  code,
  description: z.string().trim().max(500).optional(),
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
  description: z.string().trim().max(500).optional(),
  id: z.string(),
  name,
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  tallyLedgerName: z.string().trim().max(120).nullable().optional(),
  type: z.enum(accountHeadTypeValues),
});

const orgAccountInput = z.object({
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
  if (!Number.isFinite(ms)) {
    throw new Error("Invalid date");
  }
  return ms;
}

function programmeById(id: string) {
  return zql.programme.where("id", id).one();
}

export const programmeMutators = {
  create: defineMutator(programmeInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
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
    if (!(await tx.run(programmeById(args.id)))) {
      throw new Error("Programme not found");
    }
    await tx.mutate.programme.update({
      active: args.active ?? true,
      cause: args.cause ?? null,
      code: args.code,
      description: args.description ?? null,
      financeThresholdPaise: args.financeThresholdPaise ?? null,
      id: args.id,
      leadUserId: args.leadUserId ?? null,
      name: args.name,
      sortOrder: args.sortOrder ?? 0,
      updatedAt: Date.now(),
    });
  }),
};

export const projectMutators = {
  create: defineMutator(projectInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    if (!(await tx.run(programmeById(args.programmeId)))) {
      throw new Error("Programme not found");
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
    if (!(await tx.run(programmeById(args.programmeId)))) {
      throw new Error("Programme not found");
    }
    await tx.mutate.project.update({
      code: args.code,
      description: args.description ?? null,
      endsOn: isoDateToEpoch(args.endsOn),
      id: args.id,
      kind: args.kind ?? existing.kind,
      name: args.name,
      programmeId: args.programmeId,
      quotedBudgetPaise: args.quotedBudgetPaise ?? null,
      reportDueOn: isoDateToEpoch(args.reportDueOn),
      startsOn: isoDateToEpoch(args.startsOn),
      status: args.status ?? existing.status,
      updatedAt: Date.now(),
    });
  }),
};

export const fundMutators = {
  create: defineMutator(fundInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
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
    await tx.mutate.fund.update({
      active: args.active ?? true,
      code: args.code,
      description: args.description ?? null,
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
    await tx.mutate.costCentre.update({
      active: args.active ?? true,
      code: args.code,
      id: args.id,
      name: args.name,
      stateUt: args.stateUt ?? null,
      updatedAt: Date.now(),
    });
  }),
};

export const accountHeadMutators = {
  create: defineMutator(accountHeadInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
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
    if (args.parentId === args.id) {
      throw new Error("An account head cannot be its own parent");
    }
    await tx.mutate.accountHead.update({
      active: args.active ?? true,
      code: args.code,
      description: args.description ?? null,
      id: args.id,
      name: args.name,
      parentId: args.parentId ?? null,
      sortOrder: args.sortOrder ?? 0,
      tallyLedgerName: args.tallyLedgerName ?? null,
      type: args.type,
      updatedAt: Date.now(),
    });
  }),
};

export const orgAccountMutators = {
  create: defineMutator(orgAccountInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const now = Date.now();
    await tx.mutate.orgAccount.insert({
      active: args.active ?? true,
      createdAt: now,
      fcraRole: args.fcraRole ?? "none",
      fundSource: args.fundSource ?? "domestic",
      id: args.id,
      kind: args.kind,
      name: args.name,
      updatedAt: now,
    });
  }),
  update: defineMutator(orgAccountInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const existing = await tx.run(zql.orgAccount.where("id", args.id).one());
    if (!existing) {
      throw new Error("Organisation account not found");
    }
    await tx.mutate.orgAccount.update({
      active: args.active ?? true,
      fcraRole: args.fcraRole ?? existing.fcraRole,
      fundSource: args.fundSource ?? existing.fundSource,
      id: args.id,
      kind: args.kind,
      name: args.name,
      updatedAt: Date.now(),
    });
  }),
};
