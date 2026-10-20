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

/** A circular went out: every trustee it went to is asked to respond. */
export async function notifyCircularIssued(notice: {
  circularId: string;
  responseDueOn: string;
  titles: string[];
  userIds: string[];
}): Promise<void> {
  const path = `/governance/resolutions/circulars/${notice.circularId}`;
  const due = formatDay(notice.responseDueOn);
  const [first] = notice.titles;
  const title =
    notice.titles.length === 1
      ? (first ?? "")
      : `${notice.titles.length} resolutions`;
  const paragraphs = [
    notice.titles.length === 1
      ? `A circular resolution needs your response: "${first ?? ""}".`
      : `A circular with ${notice.titles.length} resolutions needs your response: ${notice.titles.map((t) => `"${t}"`).join(", ")}.`,
    `Read it, object to any resolution you disagree with, then sign the circular with your DSC by ${due}: your signature assents to the rest. If you have a conflict of interest in one, declare it instead.`,
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
          meta: `Respond by ${due}`,
          name: title,
          status: { label: "Your vote", tone: "warning" },
        },
        emailHtml,
        idempotencyKey: `circular-issued-${notice.circularId}-${userId}`,
        title: `Circular for your vote: ${title}`,
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

export interface DecidedResolution {
  number: string | null;
  outcome: "passed" | "failed" | "withdrawn";
  outcomeNote: string | null;
  /** Its place in the circular; null for a meeting's resolution. */
  position: number | null;
  resolutionId: string;
  title: string;
}

function decidedLine(r: DecidedResolution): string {
  const name = r.position
    ? `Resolution ${r.position}, "${r.title}",`
    : `"${r.title}"`;
  const outcome =
    r.outcome === "passed" && r.number
      ? `passed and is recorded as ${r.number}`
      : OUTCOME_TEXT[r.outcome];
  return `${name} ${outcome}.${r.outcomeNote ? ` ${r.outcomeNote}` : ""}`;
}

/**
 * Resolutions one response, withdrawal or close decided: the trustees and
 * the secretaries hear once, with each outcome.
 */
export async function notifyResolutionsDecided(notice: {
  circularId: string | null;
  resolutions: DecidedResolution[];
  userIds: string[];
}): Promise<void> {
  const [only] = notice.resolutions;
  if (!only) {
    return;
  }
  const single = notice.resolutions.length === 1;
  const path =
    single || !notice.circularId
      ? `/governance/resolutions/${only.resolutionId}`
      : `/governance/resolutions/circulars/${notice.circularId}`;
  const paragraphs = notice.resolutions.map(decidedLine);
  const passed = notice.resolutions.filter((r) => r.outcome === "passed");
  const heading = single
    ? only.outcome === "passed"
      ? "Resolution passed"
      : `Resolution ${OUTCOME_TEXT[only.outcome]}`
    : `${notice.resolutions.length} resolutions decided`;
  const title = single
    ? only.outcome === "passed"
      ? `Passed: ${only.title}`
      : `Resolution ${OUTCOME_TEXT[only.outcome]}: ${only.title}`
    : `${notice.resolutions.length} resolutions decided, ${passed.length} passed`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: single ? "Open the resolution" : "Open the circular",
    ctaUrl: `${env.APP_URL}${path}`,
    heading,
    paragraphs,
  });
  const key = notice.resolutions
    .map((r) => `${r.resolutionId}-${r.outcome}`)
    .join("_");
  await Promise.all(
    notice.userIds.map((userId) =>
      sendMessage({
        body: paragraphs.join(" "),
        clickAction: path,
        digest: {
          actionLabel: "Open",
          meta: single
            ? (only.number ?? OUTCOME_TEXT[only.outcome])
            : `${passed.length} of ${notice.resolutions.length} passed`,
          name: single ? only.title : heading,
          status: {
            label: passed.length > 0 ? "Passed" : "Closed",
            tone: passed.length > 0 ? "success" : "neutral",
          },
        },
        emailHtml,
        idempotencyKey: `resolutions-decided-${key}-${userId}`,
        title,
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
    "Close it in the Proud Indian dashboard with the filing or record that proves it was done.",
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
