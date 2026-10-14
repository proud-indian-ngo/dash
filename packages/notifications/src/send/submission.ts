import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { formatPaise, sumPaise } from "@pi-dash/shared/money";

import type { LineItemDetail } from "../helpers";
import { getUserIdsWithPermission } from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";
import type { Topic } from "../topics";

function computeTotal(items: LineItemDetail[]): number {
  return sumPaise(items.map((item) => item.amountPaise));
}

function formatTotalSuffix(items: LineItemDetail[]): string {
  if (items.length === 0) {
    return "";
  }
  return ` (${formatPaise(computeTotal(items))})`;
}

interface SubmissionNotifierConfig {
  entityLabel: string;
  getLineItems: (entityId: string) => Promise<LineItemDetail[]>;
  idempotencyPrefix: string;
  /** Plural noun for the list page, e.g. "reimbursements". */
  listNoun: string;
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
  listNoun,
  routePrefix,
  idempotencyPrefix,
  getLineItems,
  submittedTopic,
  statusTopic,
}: SubmissionNotifierConfig): SubmissionNotifier {
  const listPath = `/${routePrefix}`;
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
        status: { label: "Approved", tone: "success" },
      });
      await sendMessage({
        body: `${baseMessage}${totalSuffix}${note ? `\n\nMessage: ${note}` : ""}`,
        clickAction: `/${routePrefix}/${entityId}`,
        digest: {
          amountPaise: computeTotal(lineItems),
          list: { label: `View ${listNoun}`, path: listPath },
          meta: note ? `${entityLabel} · Note: ${note}` : entityLabel,
          name: title,
          status: { label: "Approved", tone: "success" },
        },
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
        status: { label: "Not approved", tone: "danger" },
      });
      await sendMessage({
        body: `${baseMessage} ${reason}${totalSuffix}`,
        clickAction: `/${routePrefix}/${entityId}`,
        digest: {
          amountPaise: computeTotal(lineItems),
          list: { label: `View ${listNoun}`, path: listPath },
          meta: `${entityLabel} · Reason: ${reason}`,
          name: title,
          status: { label: "Not approved", tone: "danger" },
        },
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
        status: { label: "Needs review", tone: "warning" },
      });
      await sendBulkMessage({
        body: `${baseMessage}${totalSuffix}`,
        clickAction: `/${routePrefix}/${entityId}`,
        digest: {
          actionLabel: "Review",
          amountPaise: computeTotal(lineItems),
          list: { label: `Review ${listNoun}`, path: listPath },
          meta: `${submitterName} · ${entityLabel}`,
          name: title,
          status: { label: "Needs review", tone: "warning" },
        },
        emailHtml,
        idempotencyKey: `${idempotencyPrefix}-submitted-${entityId}`,
        title: `👀 New ${entityLabel.toLowerCase()} to review`,
        topic: submittedTopic,
        userIds: approverIds,
      });
    },
  };
}
