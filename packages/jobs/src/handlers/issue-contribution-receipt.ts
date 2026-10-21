import { db } from "@pi-dash/db";
import {
  hasReceiptHistoryIn,
  issueReceiptsIn,
  loadReceiptConfig,
  receiptConfigGaps,
  ReceiptError,
  type ReceiptTx,
} from "@pi-dash/db/queries/contribution-receipts";

import {
  enqueue,
  inTransaction,
  type IssueContributionReceiptPayload,
} from "../enqueue";
import { safeReceiptJobError } from "../lib/receipt-errors";
import {
  readReceiptSignature,
  ReceiptSignatureError,
} from "../lib/receipt-pdf";
import { createNotifyHandler } from "./create-handler";

export type AutomaticReceiptOutcome =
  | { outcome: "issued"; receiptId: string }
  | { outcome: "existing_receipt" }
  | {
      outcome: "config_missing";
      reason: "receipt_configuration_incomplete";
    }
  | {
      outcome: "not_ready";
      reason:
        | "contribution_not_eligible"
        | "contribution_not_found"
        | "donor_details_incomplete"
        | "donor_details_unavailable";
    };

type TransactionRunner = <T>(work: (tx: ReceiptTx) => Promise<T>) => Promise<T>;

export interface IssueContributionReceiptDependencies {
  configGaps: typeof receiptConfigGaps;
  enqueueJob: typeof enqueue;
  hasHistory: typeof hasReceiptHistoryIn;
  issue: typeof issueReceiptsIn;
  loadConfig: typeof loadReceiptConfig;
  readSignature: typeof readReceiptSignature;
  runTransaction: TransactionRunner;
  transactionDb: typeof inTransaction;
}

const defaults: IssueContributionReceiptDependencies = {
  configGaps: receiptConfigGaps,
  enqueueJob: enqueue,
  hasHistory: hasReceiptHistoryIn,
  issue: issueReceiptsIn,
  loadConfig: loadReceiptConfig,
  readSignature: readReceiptSignature,
  runTransaction: (work) => db.transaction(work),
  transactionDb: inTransaction,
};

function notReadyReason(
  reason: string
): Extract<AutomaticReceiptOutcome, { outcome: "not_ready" }>["reason"] {
  if (reason === "not_found") {
    return "contribution_not_found";
  }
  if (
    reason
      .split(",")
      .some((part) =>
        [
          "missing_name",
          "missing_address",
          "missing_id",
          "invalid_id",
        ].includes(part)
      )
  ) {
    return "donor_details_incomplete";
  }
  return "contribution_not_eligible";
}

/**
 * Issues one automatic receipt and queues storage and both delivery channels atomically.
 * Expected readiness failures are returned as bounded codes; unexpected
 * errors are stripped before pg-boss persists or logs them.
 */
export async function issueContributionReceipt(
  data: IssueContributionReceiptPayload,
  deps: IssueContributionReceiptDependencies = defaults
): Promise<AutomaticReceiptOutcome> {
  try {
    return await deps.runTransaction(async (tx) => {
      if (await deps.hasHistory(tx, data.contributionId)) {
        return { outcome: "existing_receipt" };
      }
      const config = await deps.loadConfig(tx);
      if (
        deps.configGaps(config).length > 0 ||
        !config.settings?.signatureKey
      ) {
        return {
          outcome: "config_missing",
          reason: "receipt_configuration_incomplete",
        };
      }
      await deps.readSignature(config.settings.signatureKey);

      const result = await deps.issue(tx, {
        actorId: data.actorId,
        contributionIds: [data.contributionId],
      });
      const issued = result.issued[0];
      if (!issued) {
        return {
          outcome: "not_ready",
          reason: notReadyReason(
            result.skipped[0]?.reason ?? "contribution_not_eligible"
          ),
        };
      }

      const options = {
        db: deps.transactionDb(tx),
        singletonKey: `automatic:${issued.id}`,
      };
      await deps.enqueueJob(
        "store-contribution-receipt-pdf",
        { receiptId: issued.id },
        options
      );
      const payload = { receiptId: issued.id, requestId: "automatic" };
      await deps.enqueueJob("send-contribution-receipt", payload, options);
      await deps.enqueueJob(
        "send-contribution-receipt-whatsapp",
        payload,
        options
      );
      return { outcome: "issued", receiptId: issued.id };
    });
  } catch (error) {
    if (error instanceof ReceiptSignatureError) {
      return {
        outcome: "config_missing",
        reason: "receipt_configuration_incomplete",
      };
    }
    if (error instanceof ReceiptError) {
      return { outcome: "not_ready", reason: "donor_details_unavailable" };
    }
    throw safeReceiptJobError(error, "issue_contribution_receipt_failed");
  }
}

export const handleIssueContributionReceipt = createNotifyHandler<
  IssueContributionReceiptPayload,
  AutomaticReceiptOutcome
>(
  "issue-contribution-receipt",
  async () => (data) => issueContributionReceipt(data)
);
