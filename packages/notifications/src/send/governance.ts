import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";

import { sendMessage } from "../send-message";
import { TOPICS } from "../topics";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** "6 Dec 2028" from yyyy-MM-dd. */
function formatDay(isoDate: string): string {
  return dateFmt.format(new Date(`${isoDate}T00:00:00Z`));
}

export interface TermEndingOptions {
  daysLeft: number;
  /** The term's last day, yyyy-MM-dd. */
  lastDay: string;
  /** True when the board would fall below the deed's minimum once it ends. */
  leavesBoardShort: boolean;
  termId: string;
  trusteeName: string;
  userId: string;
  /** The recipient is the trustee whose term it is. */
  isOwnTerm: boolean;
}

/**
 * A trustee's fixed term is ending (90, 30 and 7 days ahead). Goes to the
 * trustee and to everyone who runs governance. One message per recipient,
 * term and offset, whatever retries happen.
 */
export async function notifyTermEnding(
  options: TermEndingOptions
): Promise<void> {
  const when = `${formatDay(options.lastDay)} (${options.daysLeft} days)`;
  const subject = options.isOwnTerm
    ? "your term as a trustee"
    : `${options.trusteeName}'s term as a trustee`;
  const paragraphs = [
    `${options.isOwnTerm ? "Your" : `${options.trusteeName}'s`} term as a trustee of Proud Indian ends on ${when}. To continue, the board reappoints them by resolution before then.`,
  ];
  if (options.leavesBoardShort) {
    paragraphs.push(
      "When this term ends the board falls below the deed's minimum of two trustees, and can then act only to fill vacancies."
    );
  }
  const body = paragraphs.join(" ");
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Open the register",
    ctaUrl: `${env.APP_URL}/governance`,
    heading: `Ending soon: ${subject}`,
    paragraphs,
  });
  await sendMessage({
    body,
    clickAction: "/governance",
    digest: {
      actionLabel: "Open",
      meta: `Ends ${formatDay(options.lastDay)}`,
      name: `Term ending: ${options.trusteeName}`,
      status: {
        label: options.leavesBoardShort ? "Board short" : "Ending",
        tone: "warning",
      },
    },
    emailHtml,
    idempotencyKey: `trustee-term-ending-${options.termId}-${options.daysLeft}-${options.userId}`,
    title: `Trustee term ending: ${options.trusteeName}`,
    to: options.userId,
    topic: TOPICS.GOVERNANCE,
    whatsappTemplate: null,
  });
}

// ── Resolutions ─────────────────────────────────────────────────────────────

export interface ResolutionNotice {
  /** For "decided": the outcome. */
  number?: string | null;
  outcome?: "passed" | "failed" | "withdrawn";
  outcomeNote?: string | null;
  resolutionId: string;
  responseDueOn?: string | null;
  title: string;
}

/** A circular went out: every trustee it went to is asked to respond. */
export async function notifyResolutionIssued(
  notice: ResolutionNotice & { userIds: string[] }
): Promise<void> {
  const path = `/governance/resolutions/${notice.resolutionId}`;
  const due = notice.responseDueOn ? formatDay(notice.responseDueOn) : null;
  const paragraphs = [
    `A circular resolution needs your response: "${notice.title}".`,
    `Read it, then either sign it with your DSC or record an objection${due ? ` by ${due}` : ""}. If you have a conflict of interest, declare it instead.`,
  ];
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Open the circular",
    ctaUrl: `${env.APP_URL}${path}`,
    heading: "A circular needs your vote",
    paragraphs,
  });
  await Promise.all(
    notice.userIds.map((userId) =>
      sendMessage({
        body: paragraphs.join(" "),
        clickAction: path,
        digest: {
          actionLabel: "Respond",
          meta: due ? `Respond by ${due}` : "Respond",
          name: notice.title,
          status: { label: "Your vote", tone: "warning" },
        },
        emailHtml,
        idempotencyKey: `resolution-issued-${notice.resolutionId}-${userId}`,
        title: `Circular for your vote: ${notice.title}`,
        to: userId,
        topic: TOPICS.GOVERNANCE,
        whatsappTemplate: null,
      })
    )
  );
}

const OUTCOME_TEXT = {
  failed: "did not pass",
  passed: "passed",
  withdrawn: "was withdrawn",
} as const;

/** A circular passed, failed or was withdrawn: the trustees and the secretaries hear. */
export async function notifyResolutionDecided(
  notice: ResolutionNotice & { userIds: string[] }
): Promise<void> {
  const outcome = notice.outcome ?? "passed";
  const path = `/governance/resolutions/${notice.resolutionId}`;
  const first =
    outcome === "passed" && notice.number
      ? `The circular "${notice.title}" passed and is recorded as ${notice.number}.`
      : `The circular "${notice.title}" ${OUTCOME_TEXT[outcome]}.`;
  const paragraphs = notice.outcomeNote ? [first, notice.outcomeNote] : [first];
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Open the resolution",
    ctaUrl: `${env.APP_URL}${path}`,
    heading:
      outcome === "passed"
        ? "Resolution passed"
        : `Circular ${OUTCOME_TEXT[outcome]}`,
    paragraphs,
  });
  await Promise.all(
    notice.userIds.map((userId) =>
      sendMessage({
        body: paragraphs.join(" "),
        clickAction: path,
        digest: {
          actionLabel: "Open",
          meta: notice.number ?? OUTCOME_TEXT[outcome],
          name: notice.title,
          status: {
            label: outcome === "passed" ? "Passed" : "Closed",
            tone: outcome === "passed" ? "success" : "neutral",
          },
        },
        emailHtml,
        idempotencyKey: `resolution-decided-${notice.resolutionId}-${outcome}-${userId}`,
        title:
          outcome === "passed"
            ? `Passed: ${notice.title}`
            : `Circular ${OUTCOME_TEXT[outcome]}: ${notice.title}`,
        to: userId,
        topic: TOPICS.GOVERNANCE,
        whatsappTemplate: null,
      })
    )
  );
}

// ── Compliance calendar ─────────────────────────────────────────────────────

/** A compliance item is due in 30, 7 or 1 days. */
export async function notifyComplianceDue(options: {
  daysLeft: number;
  dueOn: string;
  itemId: string;
  title: string;
  userId: string;
}): Promise<void> {
  const when =
    options.daysLeft === 1 ? "tomorrow" : `in ${options.daysLeft} days`;
  const paragraphs = [
    `"${options.title}" is due ${when}, on ${formatDay(options.dueOn)}.`,
    "Close it in pi-dash with the filing or record that proves it was done.",
  ];
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Open the calendar",
    ctaUrl: `${env.APP_URL}/governance/compliance`,
    heading: `Due ${when}: ${options.title}`,
    paragraphs,
  });
  await sendMessage({
    body: paragraphs.join(" "),
    clickAction: "/governance/compliance",
    digest: {
      actionLabel: "Open",
      meta: `Due ${formatDay(options.dueOn)}`,
      name: options.title,
      status: {
        label: options.daysLeft <= 7 ? "Due soon" : "Coming up",
        tone: options.daysLeft <= 7 ? "warning" : "info",
      },
    },
    emailHtml,
    idempotencyKey: `compliance-due-${options.itemId}-${options.daysLeft}-${options.userId}`,
    title: `Due ${when}: ${options.title}`,
    to: options.userId,
    topic: TOPICS.GOVERNANCE,
    whatsappTemplate: null,
  });
}

/**
 * A board meeting has been convened: the notice goes to every trustee in
 * office on its date and to everyone who runs governance.
 */
export async function notifyMeetingNotice(notice: {
  meetingId: string;
  /** "20 Oct 2026, 10:00", in India time. */
  startsAt: string;
  title: string;
  userIds: string[];
  where: string;
}): Promise<void> {
  const path = `/governance/meetings/${notice.meetingId}`;
  const paragraphs = [
    `A board meeting has been called: "${notice.title}", on ${notice.startsAt} (${notice.where}).`,
    "The agenda is on the meeting's page. If you can't attend, tell the secretary so the minutes record your leave of absence; you can also send your written views on a resolution.",
  ];
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Open the agenda",
    ctaUrl: `${env.APP_URL}${path}`,
    heading: "Notice of a board meeting",
    paragraphs,
  });
  await Promise.all(
    notice.userIds.map((userId) =>
      sendMessage({
        body: paragraphs.join(" "),
        clickAction: path,
        digest: {
          actionLabel: "Open",
          meta: notice.startsAt,
          name: notice.title,
          status: { label: "Meeting", tone: "info" },
        },
        emailHtml,
        idempotencyKey: `meeting-notice-${notice.meetingId}-${userId}`,
        title: `Board meeting: ${notice.title}`,
        to: userId,
        topic: TOPICS.GOVERNANCE,
        whatsappTemplate: null,
      })
    )
  );
}
