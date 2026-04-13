import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

interface TeamUpdatedOptions {
  memberIds: string[];
  teamId: string;
  teamName: string;
  updatedAt: number;
}

interface TeamDeletedOptions {
  deletedAt: number;
  memberIds: string[];
  teamName: string;
}

interface AddedToTeamOptions {
  teamId: string;
  teamName: string;
  userId: string;
}

interface RemovedFromTeamOptions {
  removedAt: number;
  teamName: string;
  userId: string;
}

export async function notifyTeamUpdated({
  memberIds,
  teamId,
  teamName,
  updatedAt,
}: TeamUpdatedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Team update",
    paragraphs: [`${teamName} just got an update — take a look!`],
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    ctaLabel: "Check it out",
  });
  await sendBulkMessage({
    userIds: memberIds,
    title: "📋 Team update",
    body: `${teamName} just got an update — take a look!`,
    emailHtml,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `team-updated-${teamId}-${updatedAt}`,
    topic: TOPICS.TEAMS,
  });
}

export async function notifyTeamDeleted({
  deletedAt,
  memberIds,
  teamName,
}: TeamDeletedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Team removed",
    paragraphs: [`${teamName} has been removed.`],
    ctaUrl: `${env.APP_URL}/teams`,
    ctaLabel: "View teams",
  });
  await sendBulkMessage({
    userIds: memberIds,
    title: "📋 Team removed",
    body: `${teamName} has been removed.`,
    emailHtml,
    clickAction: "/teams",
    idempotencyKey: `team-deleted-${teamName}-${deletedAt}`,
    topic: TOPICS.TEAMS,
  });
}

export async function notifyAddedToTeam({
  userId,
  teamName,
  teamId,
}: AddedToTeamOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "You're on the team!",
    paragraphs: [`You've been added to ${teamName} — welcome aboard!`],
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    ctaLabel: "Meet the team",
  });
  await sendMessage({
    to: userId,
    title: "🙌 You're on the team!",
    body: `You've been added to ${teamName} — welcome aboard!`,
    emailHtml,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `team-member-added-${teamId}-${userId}`,
    topic: TOPICS.TEAMS,
  });
}

export async function notifyRemovedFromTeam({
  removedAt,
  userId,
  teamName,
}: RemovedFromTeamOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Team change",
    paragraphs: [`You've been moved out of ${teamName}.`],
    ctaUrl: `${env.APP_URL}/teams`,
    ctaLabel: "View teams",
  });
  await sendMessage({
    to: userId,
    title: "📋 Team change",
    body: `You've been moved out of ${teamName}.`,
    emailHtml,
    clickAction: "/teams",
    idempotencyKey: `team-member-removed-${teamName}-${userId}-${removedAt}`,
    topic: TOPICS.TEAMS,
  });
}

interface TeamRoleChangedOptions {
  newRole: string;
  teamId: string;
  teamName: string;
  userId: string;
}

export async function notifyTeamRoleChanged({
  userId,
  teamId,
  teamName,
  newRole,
}: TeamRoleChangedOptions): Promise<void> {
  const isLead = newRole === "lead";
  const bodyText = isLead
    ? `You've been promoted to lead in ${teamName} — nice!`
    : `Your role in ${teamName} has been updated to member.`;
  const heading = isLead ? "Level up!" : "Team role update";
  const titleEmoji = isLead ? "⭐" : "📋";
  const emailHtml = await renderNotificationEmail({
    heading,
    paragraphs: [bodyText],
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    ctaLabel: "Check it out",
  });
  await sendMessage({
    to: userId,
    title: `${titleEmoji} ${heading}`,
    body: bodyText,
    emailHtml,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `team-role-changed-${teamId}-${userId}-${newRole}`,
    topic: TOPICS.TEAMS,
  });
}
