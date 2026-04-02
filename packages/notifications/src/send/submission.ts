import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import type { LineItemDetail } from "../helpers";
import { getUserIdsWithPermission } from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";
import type { Topic } from "../topics";

const currencyFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
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
  screenshotUrl?: string;
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
    async notifySubmitted({ entityId, title, submitterName }) {
      const [approverIds, lineItems] = await Promise.all([
        getUserIdsWithPermission("requests.approve"),
        getLineItems(entityId),
      ]);
      const totalSuffix = formatTotalSuffix(lineItems);
      const baseMessage = `${submitterName} submitted "${title}" for review.`;
      const fullUrl = `${env.APP_URL}/${routePrefix}/${entityId}`;
      const emailHtml = await renderNotificationEmail({
        heading: `New ${entityLabel} Submitted`,
        paragraphs: [baseMessage],
        lineItems,
        ctaUrl: fullUrl,
        ctaLabel: `View ${entityLabel}`,
      });
      await sendBulkMessage({
        userIds: approverIds,
        title: `New ${entityLabel} Submitted`,
        body: `${baseMessage}${totalSuffix}`,
        emailHtml,
        clickAction: `/${routePrefix}/${entityId}`,
        idempotencyKey: `${idempotencyPrefix}-submitted-${entityId}`,
        topic: submittedTopic,
      });
    },

    async notifyApproved({
      entityId,
      title,
      submitterId,
      note,
      screenshotUrl,
    }) {
      const lineItems = await getLineItems(entityId);
      const totalSuffix = formatTotalSuffix(lineItems);
      const baseMessage = `Your ${entityLabel.toLowerCase()} "${title}" has been approved.`;
      const fullUrl = `${env.APP_URL}/${routePrefix}/${entityId}`;
      const emailHtml = await renderNotificationEmail({
        heading: `${entityLabel} Approved`,
        paragraphs: [baseMessage],
        lineItems,
        note: note ?? undefined,
        imageUrl: screenshotUrl,
        ctaUrl: fullUrl,
        ctaLabel: `View ${entityLabel}`,
      });
      await sendMessage({
        to: submitterId,
        title: `${entityLabel} Approved`,
        body: `${baseMessage}${totalSuffix}${note ? `\n\nMessage: ${note}` : ""}`,
        emailHtml,
        clickAction: `/${routePrefix}/${entityId}`,
        idempotencyKey: `${idempotencyPrefix}-approved-${entityId}-${submitterId}`,
        imageUrl: screenshotUrl,
        topic: statusTopic,
      });
    },

    async notifyRejected({ entityId, title, submitterId, reason }) {
      const lineItems = await getLineItems(entityId);
      const totalSuffix = formatTotalSuffix(lineItems);
      const baseMessage = `Your ${entityLabel.toLowerCase()} "${title}" was rejected.`;
      const fullUrl = `${env.APP_URL}/${routePrefix}/${entityId}`;
      const emailHtml = await renderNotificationEmail({
        heading: `${entityLabel} Rejected`,
        paragraphs: [baseMessage, `Reason: ${reason}`],
        lineItems,
        ctaUrl: fullUrl,
        ctaLabel: `View ${entityLabel}`,
      });
      await sendMessage({
        to: submitterId,
        title: `${entityLabel} Rejected`,
        body: `${baseMessage} ${reason}${totalSuffix}`,
        emailHtml,
        clickAction: `/${routePrefix}/${entityId}`,
        idempotencyKey: `${idempotencyPrefix}-rejected-${entityId}-${submitterId}`,
        topic: statusTopic,
      });
    },
  };
}
