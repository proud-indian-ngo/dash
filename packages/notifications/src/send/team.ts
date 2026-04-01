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
  await sendBulkMessage({
    userIds: memberIds,
    title: "Team Updated",
    body: `${teamName} has been updated.`,
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
  await sendBulkMessage({
    userIds: memberIds,
    title: "Team Deleted",
    body: `${teamName} has been deleted.`,
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
  await sendMessage({
    to: userId,
    title: "Added to Team",
    body: `You've been added to ${teamName}.`,
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
  await sendMessage({
    to: userId,
    title: "Removed from Team",
    body: `You've been removed from ${teamName}.`,
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
  const label = newRole === "lead" ? "promoted to lead" : "changed to member";
  await sendMessage({
    to: userId,
    title: "Team Role Updated",
    body: `You have been ${label} in ${teamName}.`,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `team-role-changed-${teamId}-${userId}-${newRole}`,
    topic: TOPICS.TEAMS,
  });
}
