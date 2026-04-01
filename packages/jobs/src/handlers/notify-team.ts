import {
  notifyAddedToTeam,
  notifyRemovedFromTeam,
  notifyTeamDeleted,
  notifyTeamRoleChanged,
  notifyTeamUpdated,
} from "@pi-dash/notifications";
import type {
  NotifyAddedToTeamPayload,
  NotifyRemovedFromTeamPayload,
  NotifyTeamDeletedPayload,
  NotifyTeamRoleChangedPayload,
  NotifyTeamUpdatedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyTeamUpdated =
  createNotifyHandler<NotifyTeamUpdatedPayload>(
    "notify-team-updated",
    async () => notifyTeamUpdated
  );

export const handleNotifyTeamDeleted =
  createNotifyHandler<NotifyTeamDeletedPayload>(
    "notify-team-deleted",
    async () => notifyTeamDeleted
  );

export const handleNotifyAddedToTeam =
  createNotifyHandler<NotifyAddedToTeamPayload>(
    "notify-added-to-team",
    async () => notifyAddedToTeam
  );

export const handleNotifyRemovedFromTeam =
  createNotifyHandler<NotifyRemovedFromTeamPayload>(
    "notify-removed-from-team",
    async () => notifyRemovedFromTeam
  );

export const handleNotifyTeamRoleChanged =
  createNotifyHandler<NotifyTeamRoleChangedPayload>(
    "notify-team-role-changed",
    async () => notifyTeamRoleChanged
  );
