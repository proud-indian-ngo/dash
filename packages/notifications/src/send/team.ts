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
    ctaLabel: "Check it out",
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    heading: "Team update",
    paragraphs: [`${teamName} just got an update — take a look!`],
  });
  await sendBulkMessage({
    body: `${teamName} just got an update — take a look!`,
    clickAction: `/teams/${teamId}`,
    emailHtml,
    idempotencyKey: `team-updated-${teamId}-${updatedAt}`,
    title: "📋 Team update",
    topic: TOPICS.TEAMS,
    userIds: memberIds,
  });
}

export async function notifyTeamDeleted({
  deletedAt,
  memberIds,
  teamName,
}: TeamDeletedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View teams",
    ctaUrl: `${env.APP_URL}/teams`,
    heading: "Team removed",
    paragraphs: [`${teamName} has been removed.`],
  });
  await sendBulkMessage({
    body: `${teamName} has been removed.`,
    clickAction: "/teams",
    emailHtml,
    idempotencyKey: `team-deleted-${teamName}-${deletedAt}`,
    title: "📋 Team removed",
    topic: TOPICS.TEAMS,
    userIds: memberIds,
  });
}

export async function notifyAddedToTeam({
  userId,
  teamName,
  teamId,
}: AddedToTeamOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Meet the team",
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    heading: "You're on the team!",
    paragraphs: [`You've been added to ${teamName} — welcome aboard!`],
  });
  await sendMessage({
    body: `You've been added to ${teamName} — welcome aboard!`,
    clickAction: `/teams/${teamId}`,
    emailHtml,
    idempotencyKey: `team-member-added-${teamId}-${userId}`,
    title: "🙌 You're on the team!",
    to: userId,
    topic: TOPICS.TEAMS,
  });
}

export async function notifyRemovedFromTeam({
  removedAt,
  userId,
  teamName,
}: RemovedFromTeamOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View teams",
    ctaUrl: `${env.APP_URL}/teams`,
    heading: "Team change",
    paragraphs: [`You've been moved out of ${teamName}.`],
  });
  await sendMessage({
    body: `You've been moved out of ${teamName}.`,
    clickAction: "/teams",
    emailHtml,
    idempotencyKey: `team-member-removed-${teamName}-${userId}-${removedAt}`,
    title: "📋 Team change",
    to: userId,
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
    ctaLabel: "Check it out",
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    heading,
    paragraphs: [bodyText],
  });
  await sendMessage({
    body: bodyText,
    clickAction: `/teams/${teamId}`,
    emailHtml,
    idempotencyKey: `team-role-changed-${teamId}-${userId}-${newRole}`,
    title: `${titleEmoji} ${heading}`,
    to: userId,
    topic: TOPICS.TEAMS,
  });
}
