import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { paiseSchema } from "@pi-dash/shared/money";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

const saveInput = z.object({
  fiscalYearId: z.string(),
  /** The budget's ID; a new one when the scope has none yet. */
  id: z.string(),
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
  note: z.string().trim().max(500).nullable(),
  programmeId: z.string(),
  projectId: z.string().nullable(),
});

export const budgetMutators = {
  /**
   * Sets a programme's (or project's) budget for a year, replacing its
   * lines. Saving with no lines removes the budget.
   */
  save: defineMutator(saveInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "finance.manage");
    const year = await tx.run(
      zql.fiscalYear.where("id", args.fiscalYearId).one()
    );
    if (!year) {
      throw new Error("Financial year not found");
    }
    const existing = await tx.run(
      zql.budget
        .where("fiscalYearId", args.fiscalYearId)
        .where("programmeId", args.programmeId)
        .where("projectId", "IS", args.projectId)
        .related("lines")
        .one()
    );
    const programme = await tx.run(
      zql.programme.where("id", args.programmeId).one()
    );
    if (!programme) {
      throw new Error("Programme not found");
    }
    // A budget that stands can still be edited or removed once its
    // programme is retired; a new one needs a live programme.
    if (
      !existing &&
      (!programme.active || programme.id === PROGRAMME_IDS.unallocated)
    ) {
      throw new Error("Pick an active programme, not Unallocated");
    }
    if (args.projectId) {
      const project = await tx.run(
        zql.project.where("id", args.projectId).one()
      );
      if (!project || project.programmeId !== args.programmeId) {
        throw new Error("Project not found under this programme");
      }
    }
    // Heads the budget already holds stay allowed; new ones must be an
    // expense head an expense category posts to. Categories may not be on
    // the client, so the server checks.
    const held = new Set(existing?.lines.map((l) => l.accountHeadId));
    if (tx.location === "server") {
      for (const line of args.lines) {
        if (held.has(line.accountHeadId)) {
          continue;
        }
        const [head, category] = await Promise.all([
          tx.run(zql.accountHead.where("id", line.accountHeadId).one()),
          tx.run(
            zql.expenseCategory.where("accountHeadId", line.accountHeadId).one()
          ),
        ]);
        if (head?.type !== "expense" || !category) {
          throw new Error(
            "Only the expense heads of expense categories can be budgeted"
          );
        }
      }
    }

    const now = Date.now();
    if (args.lines.length === 0) {
      if (existing) {
        for (const line of existing.lines) {
          await tx.mutate.budgetLine.delete({ id: line.id });
        }
        await tx.mutate.budget.delete({ id: existing.id });
      }
      return;
    }
    if (existing && existing.id !== args.id) {
      throw new Error("This budget changed; reopen it and try again");
    }
    const note = args.note || null;
    if (existing) {
      await tx.mutate.budget.update({ id: existing.id, note, updatedAt: now });
    } else {
      await tx.mutate.budget.insert({
        createdAt: now,
        fiscalYearId: args.fiscalYearId,
        id: args.id,
        note,
        programmeId: args.programmeId,
        projectId: args.projectId,
        updatedAt: now,
      });
    }

    const kept = new Set(args.lines.map((l) => l.accountHeadId));
    const current = new Map(
      (existing?.lines ?? []).map((l) => [l.accountHeadId, l])
    );
    for (const line of current.values()) {
      if (!kept.has(line.accountHeadId)) {
        await tx.mutate.budgetLine.delete({ id: line.id });
      }
    }
    for (const line of args.lines) {
      const standing = current.get(line.accountHeadId);
      if (!standing) {
        await tx.mutate.budgetLine.insert({
          accountHeadId: line.accountHeadId,
          amountPaise: line.amountPaise,
          budgetId: args.id,
          id: line.id,
        });
      } else if (standing.amountPaise !== line.amountPaise) {
        await tx.mutate.budgetLine.update({
          amountPaise: line.amountPaise,
          id: standing.id,
        });
      }
    }
  }),
};
