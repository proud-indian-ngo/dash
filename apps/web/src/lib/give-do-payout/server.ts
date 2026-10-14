import { createHash } from "node:crypto";

import { importedRowRetention } from "@pi-dash/db/import-retention";
import {
  findGiveDoPayout,
  giveDoPayoutChanged,
  GiveDoPayoutInputError,
  recordGiveDoPayoutIn,
  requireGiveDoClearingAccount,
  validateGiveDoPayoutLinks,
} from "@pi-dash/db/queries/give-do-payouts";
import {
  claimImportBatch,
  countImportBatchRows,
  getImportBatch,
  listImportRows,
  resolveImportSettings,
  setImportRowOutcome,
  setImportRowsRetention,
  updateImportBatch,
  withImportTransaction,
} from "@pi-dash/db/queries/income-import";
import { gatewaySettlement } from "@pi-dash/db/schema/gateway-settlement";
import { todayInKolkata } from "@pi-dash/shared/income";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";

import { refreshMatchesForSettlementAmount } from "@/lib/bank-statement/server";
import type { RowDecision } from "@/lib/income-import/classify";
import {
  createImportBatch,
  ImportInputError,
  importPayoutContributionsIn,
  reviewPayoutContributions,
} from "@/lib/income-import/server";
import {
  databaseErrorFields,
  safeErrorName,
  withSafeErrors,
} from "@/lib/safe-errors";

import {
  GiveDoPayoutParseError,
  parseGiveDoPayout,
  payoutFromRows,
} from "./parse";
import type { PayoutReview, PayoutRunResult } from "./types";

export function withPayoutSafeErrors<T>(
  step: string,
  work: () => Promise<T>
): Promise<T> {
  return withSafeErrors(
    {
      fields: { event: "give_do_payout_failed", step },
      isUserFacing: (error) =>
        error instanceof ImportInputError ||
        error instanceof GiveDoPayoutInputError ||
        error instanceof GiveDoPayoutParseError,
      message:
        "The payout import couldn't be completed. No donations or settlement were changed.",
      path: "give-do-payout",
    },
    work
  );
}

async function refreshBankMatchesSafely(
  amountPaise: number,
  settlementId: string,
  actorId: string,
  now: Date
): Promise<void> {
  const log = createRequestLogger({ method: "POST", path: "give-do-payout" });
  log.set({
    actorId,
    event: "give_do_payout_bank_match_refresh",
    settlementId,
  });
  try {
    const result = await refreshMatchesForSettlementAmount(
      amountPaise,
      actorId,
      now
    );
    log.set({
      matchedCount: result.matched,
      suggestedCount: result.suggested,
    });
  } catch (error) {
    log.set({ errorName: safeErrorName(error), ...databaseErrorFields(error) });
    log.error(new Error("give.do payout bank match refresh failed"));
  } finally {
    log.emit();
  }
}

export async function createPayoutBatch(
  input: {
    base64: string;
    fileName: string;
    fundId: string;
    orgAccountId: string;
  },
  actorId: string
): Promise<PayoutReview> {
  return withPayoutSafeErrors("upload", async () => {
    const buffer = Buffer.from(input.base64, "base64");
    const parsed = await parseGiveDoPayout(buffer);
    await requireGiveDoClearingAccount(input.orgAccountId);
    const created = await createImportBatch(
      {
        csv: input.base64,
        defaultChannel: "give_do",
        fileName: input.fileName,
        fundId: input.fundId,
        orgAccountId: input.orgAccountId,
        programmeId: null,
        projectId: null,
        source: "give_do_payout",
      },
      parsed.donations,
      actorId
    );
    await updateImportBatch(created.batchId, {
      dateFormat: "dmy",
      fileHash: createHash("sha256").update(buffer).digest("hex"),
      mapping: created.mapping,
      status: "reviewed",
    });
    return getPayoutReview(created.batchId);
  });
}

async function requirePayoutBatch(batchId: string) {
  const batch = await getImportBatch(batchId);
  if (!batch || batch.source !== "give_do_payout") {
    throw new ImportInputError("Payout import not found");
  }
  if (batch.status === "expired") {
    throw new ImportInputError(
      "This upload expired. Upload the payout file again."
    );
  }
  return batch;
}

export async function getPayoutReview(batchId: string): Promise<PayoutReview> {
  return withPayoutSafeErrors("review", async () => {
    const batch = await requirePayoutBatch(batchId);
    const rows = await listImportRows(batch.id);
    if (rows.length === 0 || rows.some((row) => !row.raw)) {
      throw new ImportInputError(
        "The retained rows have expired. Upload the payout file again."
      );
    }
    const payout = payoutFromRows(rows.map((row) => row.raw ?? {}));
    const existing = await findGiveDoPayout(payout.utr);
    return {
      amountPaise: payout.amountPaise,
      existing: existing
        ? { changed: giveDoPayoutChanged(existing, payout), id: existing.id }
        : null,
      feesPaise: payout.feesPaise,
      grossPaise: payout.grossPaise,
      review: await reviewPayoutContributions(batch),
      settledOn: existing?.settledOn ?? todayInKolkata(batch.createdAt),
      utr: payout.utr,
    };
  });
}

export async function runPayoutBatch(
  input: {
    batchId: string;
    decisions: Record<string, RowDecision>;
    importUnknown: boolean;
    settledOn: string;
  },
  actorId: string
): Promise<PayoutRunResult> {
  return withPayoutSafeErrors("run", async () => {
    const current = await requirePayoutBatch(input.batchId);
    if (!current.orgAccountId) {
      throw new ImportInputError("Choose a give.do clearing account.");
    }
    if (input.settledOn > todayInKolkata()) {
      throw new ImportInputError(
        "The settlement date cannot be in the future."
      );
    }
    const orgAccountId = current.orgAccountId;
    await requireGiveDoClearingAccount(orgAccountId);
    await resolveImportSettings({
      ...current,
      orgAccountId: current.orgAccountId,
    });
    const batch = await claimImportBatch(
      current.id,
      new Date(Date.now() - 15 * 60 * 1000)
    );
    if (!batch) {
      throw new ImportInputError("This payout is already importing.");
    }
    let completed: {
      payoutAmountPaise: number;
      response: PayoutRunResult;
    };
    try {
      completed = await withImportTransaction(async (tx) => {
        await requireGiveDoClearingAccount(orgAccountId, tx, true);
        const now = new Date();
        const rows = await listImportRows(batch.id, tx);
        if (rows.length === 0 || rows.some((row) => !row.raw)) {
          throw new ImportInputError(
            "The retained rows have expired. Upload the payout file again."
          );
        }
        const payout = payoutFromRows(rows.map((row) => row.raw ?? {}));
        const existing = await findGiveDoPayout(payout.utr, tx);
        let response: PayoutRunResult;
        if (existing) {
          const changed = giveDoPayoutChanged(existing, payout);
          if (changed) {
            await tx
              .update(gatewaySettlement)
              .set({ amountChanged: true, updatedAt: now })
              .where(eq(gatewaySettlement.id, existing.id));
          }
          for (const row of rows) {
            await setImportRowOutcome(tx, row.id, {
              decidedAt: now,
              decidedBy: actorId,
              outcome: changed ? "conflict" : "skipped",
              outcomeReason: changed
                ? "changed_since_imported"
                : "payout_already_imported",
            });
          }
          response = {
            alreadyImported: true,
            changed,
            result: null,
            settlementId: existing.id,
          };
        } else {
          await validateGiveDoPayoutLinks(tx, payout, orgAccountId);
          const result = await importPayoutContributionsIn(
            tx,
            batch,
            actorId,
            input.decisions,
            input.importUnknown,
            now
          );
          const settlementId = await recordGiveDoPayoutIn(
            tx,
            { ...payout, orgAccountId, settledOn: input.settledOn },
            now
          );
          response = {
            alreadyImported: false,
            changed: false,
            result,
            settlementId,
          };
        }
        await updateImportBatch(
          batch.id,
          {
            ...(await countImportBatchRows(tx, batch.id)),
            completedAt: now,
            newDonorCount:
              batch.newDonorCount + (response.result?.newDonors ?? 0),
            status: "completed",
          },
          tx
        );
        await setImportRowsRetention(
          tx,
          batch,
          importedRowRetention(todayInKolkata(now))
        );
        return { payoutAmountPaise: payout.amountPaise, response };
      });
    } catch (error) {
      await updateImportBatch(batch.id, { status: "failed" });
      throw error;
    }
    if (!completed.response.alreadyImported) {
      await refreshBankMatchesSafely(
        completed.payoutAmountPaise,
        completed.response.settlementId,
        actorId,
        new Date()
      );
    }
    return completed.response;
  });
}
