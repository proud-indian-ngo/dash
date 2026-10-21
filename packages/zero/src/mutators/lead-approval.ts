import {
  type ApprovalRequest,
  CLEARED_LEAD_APPROVAL,
  LEAD_AND_FINANCE_DIFFER_MESSAGE,
  LEAD_SKIP_REASON_MESSAGE,
  leadApproverOf,
  leadStepOutstanding,
} from "@pi-dash/shared/approval-policy";
import type { ExpenseChargeFields } from "@pi-dash/shared/expense-charge";
import type { Transaction } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { type Schema, zql } from "../schema";
import { userName } from "./claimant";
import { buildHistoryInsert } from "./submission-helpers";

type Tx = Transaction<Schema>;

/**
 * The programme a request's money counts against, through its event when it
 * is charged to one. `undefined` when the client hasn't synced the event.
 */
async function chargedProgrammeId(
  tx: Tx,
  charge: ExpenseChargeFields
): Promise<null | string | undefined> {
  switch (charge.chargedTo) {
    case "organisation":
      return null;
    case "programme":
      return charge.chargedProgrammeId ?? null;
    default: {
      if (!charge.eventId) {
        return null;
      }
      const event = await tx.run(
        zql.teamEvent.where("id", charge.eventId).one()
      );
      if (!event) {
        return tx.location === "server" ? null : undefined;
      }
      return event.programmeId ?? null;
    }
  }
}

/**
 * The programme lead who approves the request before finance, or null when
 * the lead step doesn't apply ("Approval policy" in
 * finance-and-programmes.md). `undefined` only on the client, when it hasn't
 * synced the rows to tell: the server decides.
 */
export async function leadApproverFor(
  tx: Tx,
  request: ApprovalRequest
): Promise<null | string | undefined> {
  const programmeId = await chargedProgrammeId(tx, request);
  if (programmeId === undefined) {
    return undefined;
  }
  if (!programmeId) {
    return null;
  }
  const programme = await tx.run(zql.programme.where("id", programmeId).one());
  if (!programme && tx.location !== "server") {
    return undefined;
  }
  return leadApproverOf(
    { ...request, chargedProgrammeId: programmeId, chargedTo: "programme" },
    () => programme?.leadUserId
  );
}

/** Whether two charges count against different programmes. */
export async function programmeChanges(
  tx: Tx,
  before: ExpenseChargeFields,
  after: ExpenseChargeFields
): Promise<boolean> {
  const [from, to] = await Promise.all([
    chargedProgrammeId(tx, before),
    chargedProgrammeId(tx, after),
  ]);
  return from !== to;
}

/** Whether an edit changes what Charged to says. */
export function chargeChanges(
  before: ExpenseChargeFields,
  after: ExpenseChargeFields
): boolean {
  return (
    (before.chargedTo ?? null) !== (after.chargedTo ?? null) ||
    (before.eventId ?? null) !== (after.eventId ?? null) ||
    (before.chargedProgrammeId ?? null) !==
      (after.chargedProgrammeId ?? null) ||
    (before.chargedProjectId ?? null) !== (after.chargedProjectId ?? null)
  );
}

interface LineFacts {
  amountPaise: number;
  categoryId: string;
  description?: null | string;
  id: string;
}

/** Whether an edit adds, removes or changes a line's amount, category or text. */
export function linesChange(
  before: readonly LineFacts[],
  after: readonly LineFacts[]
): boolean {
  if (before.length !== after.length) {
    return true;
  }
  const byId = new Map(before.map((line) => [line.id, line]));
  return after.some((line) => {
    const was = byId.get(line.id);
    return (
      !was ||
      was.amountPaise !== line.amountPaise ||
      was.categoryId !== line.categoryId ||
      (was.description ?? "") !== (line.description ?? "")
    );
  });
}

export const LEAD_APPROVAL_CLEARED_NOTE =
  "Programme lead's approval cleared: the request changed after they approved it";

export const leadSkipReasonArg = {
  /** Finance approves while the lead's approval is outstanding, with why. */
  leadSkipReason: z.string().trim().max(500).optional(),
};

/**
 * Finance's approval against the lead step: with the lead's approval
 * outstanding a reason is required and stored; whoever approved as lead
 * can't approve as finance too. Returns the columns to write.
 */
export async function financeLeadStep(
  tx: Tx,
  ctx: Context,
  entity: ApprovalRequest,
  leadSkipReason: string | undefined
): Promise<{ leadSkipReason?: string }> {
  if (entity.leadApprovedBy && entity.leadApprovedBy === ctx.userId) {
    throw new Error(LEAD_AND_FINANCE_DIFFER_MESSAGE);
  }
  if (entity.leadApprovedAt || entity.leadSkipReason) {
    return {};
  }
  const lead = await leadApproverFor(tx, entity);
  if (!leadStepOutstanding(entity, lead)) {
    return {};
  }
  if (lead === ctx.userId) {
    throw new Error(LEAD_AND_FINANCE_DIFFER_MESSAGE);
  }
  const reason = leadSkipReason?.trim();
  if (!reason) {
    throw new Error(LEAD_SKIP_REASON_MESSAGE);
  }
  return { leadSkipReason: reason };
}

export const LEAD_SKIPPED_NOTE = (reason: string) =>
  `Approved without the programme lead. Reason: ${reason}`;

/**
 * The lead may act on a pending request charged to the programme they lead
 * when the lead step applies. Returns false on the client when it can't
 * tell yet, so the server decides.
 */
export async function assertIsWaitingLead(
  tx: Tx,
  ctx: Context,
  entity: ApprovalRequest
): Promise<boolean> {
  if (entity.status !== "pending") {
    throw new Error("Only a pending request waits for the programme lead");
  }
  if (entity.leadApprovedAt || entity.leadSkipReason) {
    throw new Error("This request no longer waits for the programme lead");
  }
  const lead = await leadApproverFor(tx, entity);
  if (lead === undefined) {
    return false;
  }
  if (lead !== ctx.userId) {
    throw new Error(
      "Only the lead of the programme this request is charged to can do this"
    );
  }
  return true;
}

export const OWN_REQUEST_APPROVAL_MESSAGE =
  "You can't approve or pay a request you raised or are paid by";

/**
 * Finance never approves or pays a request they raised (`createdBy`) or
 * claim (`userId`): someone else in finance does (founder decision).
 */
export function assertNotOwnRequest(
  ctx: Context,
  entity: { createdBy?: null | string; userId: string }
): void {
  if (entity.userId === ctx.userId || entity.createdBy === ctx.userId) {
    throw new Error(OWN_REQUEST_APPROVAL_MESSAGE);
  }
}

/** Each event's programme now, to compare before and after an edit. */
export async function eventProgrammes(
  tx: Tx,
  eventIds: readonly string[]
): Promise<Map<string, null | string>> {
  const rows = await Promise.all(
    eventIds.map((id) => tx.run(zql.teamEvent.where("id", id).one()))
  );
  return new Map(
    rows.flatMap((row) => (row ? [[row.id, row.programmeId ?? null]] : []))
  );
}

/**
 * An event moved to another programme. A lead approval on its pending
 * claims and vendor payments belonged to the old programme's lead, so it is
 * cleared; whoever each now waits for hears of it.
 */
export async function clearLeadApprovalsOnMovedEvents(
  tx: Tx,
  ctx: Context,
  before: ReadonlyMap<string, null | string>,
  now: number
): Promise<void> {
  const after = await eventProgrammes(tx, [...before.keys()]);
  const moved = [...before].filter(
    ([id, programmeId]) => after.has(id) && after.get(id) !== programmeId
  );
  for (const [eventId, programmeBefore] of moved) {
    const [reimbursements, vendorPayments] = await Promise.all([
      tx.run(
        zql.reimbursement.where("eventId", eventId).where("status", "pending")
      ),
      tx.run(
        zql.vendorPayment.where("eventId", eventId).where("status", "pending")
      ),
    ]);
    for (const row of reimbursements) {
      const cleared = Boolean(row.leadApprovedAt);
      if (cleared) {
        await tx.mutate.reimbursement.update({
          id: row.id,
          ...CLEARED_LEAD_APPROVAL,
          updatedAt: now,
        });
        await tx.mutate.reimbursementHistory.insert({
          ...buildHistoryInsert(
            ctx.userId,
            "updated",
            now,
            LEAD_APPROVAL_MOVED_NOTE
          ),
          reimbursementId: row.id,
        });
      }
      await notifyIfLeadNowWaiting(tx, ctx, "reimbursement", {
        after: cleared ? { ...row, ...CLEARED_LEAD_APPROVAL } : row,
        before: row,
        beforeProgrammeId: programmeBefore,
        now,
      });
    }
    for (const row of vendorPayments) {
      const cleared = Boolean(row.leadApprovedAt);
      if (cleared) {
        await tx.mutate.vendorPayment.update({
          id: row.id,
          ...CLEARED_LEAD_APPROVAL,
          updatedAt: now,
        });
        await tx.mutate.vendorPaymentHistory.insert({
          ...buildHistoryInsert(
            ctx.userId,
            "updated",
            now,
            LEAD_APPROVAL_MOVED_NOTE
          ),
          vendorPaymentId: row.id,
        });
      }
      await notifyIfLeadNowWaiting(tx, ctx, "vendorPayment", {
        after: cleared ? { ...row, ...CLEARED_LEAD_APPROVAL } : row,
        before: row,
        beforeProgrammeId: programmeBefore,
        now,
      });
    }
  }
}

type NotifiedRequest = ApprovalRequest & { id: string; title: string };

/** The lead a pending request waits for now, if any (server only). */
async function waitingLeadOf(
  tx: Tx,
  request: ApprovalRequest,
  programmeId?: null | string
): Promise<null | string> {
  if (request.status !== "pending") {
    return null;
  }
  let lead: null | string | undefined;
  if (programmeId === undefined) {
    lead = await leadApproverFor(tx, request);
  } else {
    const programme = programmeId
      ? await tx.run(zql.programme.where("id", programmeId).one())
      : undefined;
    lead = programmeId
      ? leadApproverOf(
          {
            ...request,
            chargedProgrammeId: programmeId,
            chargedTo: "programme",
          },
          () => programme?.leadUserId
        )
      : null;
  }
  return lead && leadStepOutstanding(request, lead) ? lead : null;
}

/**
 * After an edit, a reset, a claimant change or a re-charge: when the request
 * now waits for a lead it didn't wait for before (their approval was
 * cleared, or it moved to their programme), tell that lead, with the
 * `request_submitted` message under a key of its own.
 * `beforeProgrammeId` names the programme before an event moved.
 */
export async function notifyIfLeadNowWaiting(
  tx: Tx,
  ctx: Context,
  kind: "reimbursement" | "vendorPayment",
  {
    after,
    before,
    beforeProgrammeId,
    now,
  }: {
    after: NotifiedRequest;
    before: NotifiedRequest;
    beforeProgrammeId?: null | string;
    now: number;
  }
): Promise<void> {
  if (tx.location !== "server") {
    return;
  }
  const [was, is] = await Promise.all([
    waitingLeadOf(tx, before, beforeProgrammeId),
    waitingLeadOf(tx, after),
  ]);
  if (!is || is === was) {
    return;
  }
  const submitterName = await userName(tx, after.userId);
  const { id, title } = after;
  ctx.asyncTasks?.push({
    fn: async () => {
      const { enqueue } = await import("@pi-dash/jobs/enqueue");
      if (kind === "reimbursement") {
        await enqueue(
          "notify-reimbursement-submitted",
          {
            leadUserId: is,
            leadWaitingAgainAt: now,
            reimbursementId: id,
            submitterName,
            title,
          },
          { traceId: ctx.traceId }
        );
      } else {
        await enqueue(
          "notify-vendor-payment-submitted",
          {
            leadUserId: is,
            leadWaitingAgainAt: now,
            submitterName,
            title,
            vendorPaymentId: id,
          },
          { traceId: ctx.traceId }
        );
      }
    },
    meta: {
      leadUserId: is,
      mutator: `${kind}:leadWaitingAgain`,
      requestId: id,
    },
  });
}

export const LEAD_APPROVAL_MOVED_NOTE =
  "Programme lead's approval cleared: the event moved to another programme";
