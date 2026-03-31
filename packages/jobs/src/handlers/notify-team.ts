import type {
  NotifyAddedToTeamPayload,
  NotifyRemovedFromTeamPayload,
  NotifyTeamDeletedPayload,
  NotifyTeamUpdatedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyTeamUpdated =
  createNotifyHandler<NotifyTeamUpdatedPayload>(
    "notify-team-updated",
    async () => (await import("@pi-dash/notifications")).notifyTeamUpdated
  );

export const handleNotifyTeamDeleted =
  createNotifyHandler<NotifyTeamDeletedPayload>(
    "notify-team-deleted",
    async () => (await import("@pi-dash/notifications")).notifyTeamDeleted
  );

export const handleNotifyAddedToTeam =
  createNotifyHandler<NotifyAddedToTeamPayload>(
    "notify-added-to-team",
    async () => (await import("@pi-dash/notifications")).notifyAddedToTeam
  );

export const handleNotifyRemovedFromTeam =
  createNotifyHandler<NotifyRemovedFromTeamPayload>(
    "notify-removed-from-team",
    async () => (await import("@pi-dash/notifications")).notifyRemovedFromTeam
  );
