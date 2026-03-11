import { env } from "@pi-dash/env/server";
import type { LineItemDetail } from "../helpers";
import { getAdminUserIds } from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";

const currencyFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

function formatLineItemsBlock(items: LineItemDetail[]): string {
  if (items.length === 0) {
    return "";
  }

  const lines = items.map((item) => {
    const label = item.description
      ? `${item.categoryName}: ${item.description}`
      : item.categoryName;
    return `- ${label} — ${currencyFormat.format(Number(item.amount))}`;
  });

  const total = items.reduce((sum, item) => sum + Number(item.amount), 0);

  return `\n\nItems:\n${lines.join("\n")}\n\nTotal: ${currencyFormat.format(total)}`;
}

function computeTotal(items: LineItemDetail[]): number {
  return items.reduce((sum, item) => sum + Number(item.amount), 0);
}

function formatTotalSuffix(items: LineItemDetail[]): string {
  if (items.length === 0) {
    return "";
  }
  return ` (${currencyFormat.format(computeTotal(items))})`;
}

interface SubmissionNotifierConfig {
  entityLabel: string;
  getLineItems: (entityId: string) => Promise<LineItemDetail[]>;
  idempotencyPrefix: string;
  routePrefix: string;
}

interface SubmittedOptions {
  entityId: string;
  submitterName: string;
  title: string;
}

interface StatusChangeOptions {
  entityId: string;
  submitterId: string;
  title: string;
}

interface RejectedOptions extends StatusChangeOptions {
  reason: string;
}

export interface SubmissionNotifier {
  notifyApproved: (options: StatusChangeOptions) => Promise<void>;
  notifyRejected: (options: RejectedOptions) => Promise<void>;
  notifySubmitted: (options: SubmittedOptions) => Promise<void>;
}

export function createSubmissionNotifier({
  entityLabel,
  routePrefix,
  idempotencyPrefix,
  getLineItems,
}: SubmissionNotifierConfig): SubmissionNotifier {
  return {
    async notifySubmitted({ entityId, title, submitterName }) {
      const [adminIds, lineItems] = await Promise.all([
        getAdminUserIds(),
        getLineItems(entityId),
      ]);
      const totalSuffix = formatTotalSuffix(lineItems);
      const baseMessage = `${submitterName} submitted "${title}" for review.`;
      const fullUrl = `${env.APP_URL}/${routePrefix}/${entityId}`;
      await sendBulkMessage({
        userIds: adminIds,
        title: `New ${entityLabel} Submitted`,
        body: `${baseMessage}${totalSuffix}`,
        emailBody: `${baseMessage}${formatLineItemsBlock(lineItems)}\n\nView: ${fullUrl}`,
        clickAction: `/${routePrefix}/${entityId}`,
        idempotencyKey: `${idempotencyPrefix}-submitted-${entityId}`,
      });
    },

    async notifyApproved({ entityId, title, submitterId }) {
      const lineItems = await getLineItems(entityId);
      const totalSuffix = formatTotalSuffix(lineItems);
      const baseMessage = `Your ${entityLabel.toLowerCase()} "${title}" has been approved.`;
      const fullUrl = `${env.APP_URL}/${routePrefix}/${entityId}`;
      await sendMessage({
        to: submitterId,
        title: `${entityLabel} Approved`,
        body: `${baseMessage}${totalSuffix}`,
        emailBody: `${baseMessage}${formatLineItemsBlock(lineItems)}\n\nView: ${fullUrl}`,
        clickAction: `/${routePrefix}/${entityId}`,
        idempotencyKey: `${idempotencyPrefix}-approved-${entityId}-${submitterId}`,
      });
    },

    async notifyRejected({ entityId, title, submitterId, reason }) {
      const lineItems = await getLineItems(entityId);
      const totalSuffix = formatTotalSuffix(lineItems);
      const baseMessage = `Your ${entityLabel.toLowerCase()} "${title}" was rejected: ${reason}`;
      const fullUrl = `${env.APP_URL}/${routePrefix}/${entityId}`;
      await sendMessage({
        to: submitterId,
        title: `${entityLabel} Rejected`,
        body: `${baseMessage}${totalSuffix}`,
        emailBody: `${baseMessage}${formatLineItemsBlock(lineItems)}\n\nView: ${fullUrl}`,
        clickAction: `/${routePrefix}/${entityId}`,
        idempotencyKey: `${idempotencyPrefix}-rejected-${entityId}-${submitterId}`,
      });
    },
  };
}
