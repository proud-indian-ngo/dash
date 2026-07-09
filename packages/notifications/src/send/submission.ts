import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import type { LineItemDetail } from "../helpers";
import { getUserIdsWithPermission } from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";
import type { Topic } from "../topics";

const currencyFormat = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  style: "currency",
});

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
  statusTopic: Topic;
  submittedTopic: Topic;
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

interface ApprovedOptions extends StatusChangeOptions {
  note?: string;
}

interface RejectedOptions extends StatusChangeOptions {
  reason: string;
}

export interface SubmissionNotifier {
  notifyApproved: (options: ApprovedOptions) => Promise<void>;
  notifyRejected: (options: RejectedOptions) => Promise<void>;
  notifySubmitted: (options: SubmittedOptions) => Promise<void>;
}

export function createSubmissionNotifier({
  entityLabel,
  routePrefix,
  idempotencyPrefix,
  getLineItems,
  submittedTopic,
  statusTopic,
}: SubmissionNotifierConfig): SubmissionNotifier {
  return {
    async notifyApproved({ entityId, title, submitterId, note }) {
      const lineItems = await getLineItems(entityId);
      const totalSuffix = formatTotalSuffix(lineItems);
      const baseMessage = `Your ${entityLabel.toLowerCase()} "${title}" has been approved!`;
      const fullUrl = `${env.APP_URL}/${routePrefix}/${entityId}`;
      const emailHtml = await renderNotificationEmail({
        ctaLabel: `View ${entityLabel.toLowerCase()}`,
        ctaUrl: fullUrl,
        heading: `${entityLabel} approved!`,
        lineItems,
        note: note ?? undefined,
        paragraphs: [baseMessage],
      });
      await sendMessage({
        body: `${baseMessage}${totalSuffix}${note ? `\n\nMessage: ${note}` : ""}`,
        clickAction: `/${routePrefix}/${entityId}`,
        emailHtml,
        idempotencyKey: `${idempotencyPrefix}-approved-${entityId}-${submitterId}`,
        title: `✅ ${entityLabel} approved!`,
        to: submitterId,
        topic: statusTopic,
      });
    },

    async notifyRejected({ entityId, title, submitterId, reason }) {
      const lineItems = await getLineItems(entityId);
      const totalSuffix = formatTotalSuffix(lineItems);
      const baseMessage = `Your ${entityLabel.toLowerCase()} "${title}" wasn't approved.`;
      const fullUrl = `${env.APP_URL}/${routePrefix}/${entityId}`;
      const emailHtml = await renderNotificationEmail({
        ctaLabel: `View ${entityLabel.toLowerCase()}`,
        ctaUrl: fullUrl,
        heading: `${entityLabel} not approved`,
        lineItems,
        paragraphs: [baseMessage, `Reason: ${reason}`],
      });
      await sendMessage({
        body: `${baseMessage} ${reason}${totalSuffix}`,
        clickAction: `/${routePrefix}/${entityId}`,
        emailHtml,
        idempotencyKey: `${idempotencyPrefix}-rejected-${entityId}-${submitterId}`,
        title: `↩️ ${entityLabel} not approved`,
        to: submitterId,
        topic: statusTopic,
      });
    },
    async notifySubmitted({ entityId, title, submitterName }) {
      const [approverIds, lineItems] = await Promise.all([
        getUserIdsWithPermission("requests.approve"),
        getLineItems(entityId),
      ]);
      const totalSuffix = formatTotalSuffix(lineItems);
      const baseMessage = `${submitterName} submitted "${title}" — it needs your review.`;
      const fullUrl = `${env.APP_URL}/${routePrefix}/${entityId}`;
      const emailHtml = await renderNotificationEmail({
        ctaLabel: `Review ${entityLabel.toLowerCase()}`,
        ctaUrl: fullUrl,
        heading: `New ${entityLabel.toLowerCase()} to review`,
        lineItems,
        paragraphs: [baseMessage],
      });
      await sendBulkMessage({
        body: `${baseMessage}${totalSuffix}`,
        clickAction: `/${routePrefix}/${entityId}`,
        emailHtml,
        idempotencyKey: `${idempotencyPrefix}-submitted-${entityId}`,
        title: `👀 New ${entityLabel.toLowerCase()} to review`,
        topic: submittedTopic,
        userIds: approverIds,
      });
    },
  };
}
