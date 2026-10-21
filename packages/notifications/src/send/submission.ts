import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { formatPaise, sumPaise } from "@pi-dash/shared/money";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

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

/** The total for a WhatsApp template, which always needs an amount. */
function formatTemplateAmount(items: LineItemDetail[]): string {
  if (items.length === 0) {
    return "amount not entered";
  }
  return formatPaise(computeTotal(items));
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
  /** The programme lead approved; finance now reviews it. */
  leadApproval?: { at: number; leadName: string };
  /** The programme lead who reviews it first, instead of finance. */
  leadUserId?: string;
  submitterName: string;
  title: string;
}

interface StatusChangeOptions {
  entityId: string;
  /** The reviewing mutator's timestamp, so a later review notifies again. */
  reviewedAt: number;
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
  const requestType = entityLabel.toLowerCase();
  return {
    async notifyApproved({ entityId, title, submitterId, note, reviewedAt }) {
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
        idempotencyKey: `${idempotencyPrefix}-approved-${entityId}-${submitterId}-${reviewedAt}`,
        title: `✅ ${entityLabel} approved!`,
        to: submitterId,
        topic: statusTopic,
        whatsappTemplate: note
          ? whatsappTemplate(
              "request_approved_with_note",
              {
                amount: formatTemplateAmount(lineItems),
                note,
                request_type: requestType,
                title,
              },
              `/${routePrefix}/${entityId}`
            )
          : whatsappTemplate(
              "request_approved",
              {
                amount: formatTemplateAmount(lineItems),
                request_type: requestType,
                title,
              },
              `/${routePrefix}/${entityId}`
            ),
      });
    },

    async notifyRejected({ entityId, title, submitterId, reason, reviewedAt }) {
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
        idempotencyKey: `${idempotencyPrefix}-rejected-${entityId}-${submitterId}-${reviewedAt}`,
        title: `↩️ ${entityLabel} not approved`,
        to: submitterId,
        topic: statusTopic,
        whatsappTemplate: whatsappTemplate(
          "request_not_approved",
          {
            amount: formatTemplateAmount(lineItems),
            reason,
            request_type: requestType,
            title,
          },
          `/${routePrefix}/${entityId}`
        ),
      });
    },
    async notifySubmitted({
      entityId,
      leadApproval,
      leadUserId,
      title,
      submitterName,
    }) {
      // Waiting for the programme lead: only they hear of it. Finance hears
      // once the lead approves, or at once when there is no lead step.
      const [recipientIds, lineItems] = await Promise.all([
        leadUserId
          ? [leadUserId]
          : getUserIdsWithPermission("requests.approve"),
        getLineItems(entityId),
      ]);
      const totalSuffix = formatTotalSuffix(lineItems);
      let baseMessage = `${submitterName} submitted "${title}" — it needs your review.`;
      if (leadApproval) {
        baseMessage = `${leadApproval.leadName} approved "${title}" as programme lead — it needs your review.`;
      } else if (leadUserId) {
        baseMessage = `${submitterName} submitted "${title}" — it needs your review as programme lead.`;
      }
      let idempotencyKey = `${idempotencyPrefix}-submitted-${entityId}`;
      if (leadApproval) {
        idempotencyKey = `${idempotencyPrefix}-lead-approved-${entityId}-${leadApproval.at}`;
      } else if (leadUserId) {
        idempotencyKey = `${idempotencyPrefix}-submitted-${entityId}-lead`;
      }
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
        idempotencyKey,
        title: `👀 New ${entityLabel.toLowerCase()} to review`,
        topic: submittedTopic,
        userIds: recipientIds,
        whatsappTemplate: whatsappTemplate(
          "request_submitted",
          {
            amount: formatTemplateAmount(lineItems),
            request_type: requestType,
            submitter: submitterName,
            title,
          },
          `/${routePrefix}/${entityId}`
        ),
      });
    },
  };
}
