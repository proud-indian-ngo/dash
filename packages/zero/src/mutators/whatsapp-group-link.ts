import type { AsyncTask } from "../context";
import { zql } from "../schema";

// The two app-wide groups (keys mirror apps/web/src/lib/whatsapp-group-access.ts).
const APP_WIDE_GROUPS = [
  { key: "orientation_group_id", label: "orientation group" },
  { key: "all_volunteers_group_id", label: "all-volunteers group" },
] as const;

abstract class BivariantRun {
  abstract bivarianceHack(query: unknown): Promise<unknown>;
}
abstract class BivariantTaskPush {
  abstract bivarianceHack(task: AsyncTask): void;
}

interface LinkTx {
  location: string;
  run: BivariantRun["bivarianceHack"];
}

interface LinkCtx {
  asyncTasks?: { push: BivariantTaskPush["bivarianceHack"] };
  traceId?: string;
}

/**
 * The group a team or event moves to, or undefined when the request leaves
 * it alone. Undefined means "unchanged"; null or "" means "remove the group".
 */
export function whatsappGroupChange(
  current: string | null | undefined,
  requested: string | null | undefined
): string | null | undefined {
  if (requested === undefined) {
    return undefined;
  }
  const next = requested || null;
  return next === (current ?? null) ? undefined : next;
}

/** Who is asking for the group: a team, or an event and its series. */
type WhatsAppGroupOwner =
  | { type: "team"; id: string }
  | { type: "event"; seriesRootId: string };

/**
 * One team or event per group: the same group in two places would add and
 * remove people for both. An event's own series (its parent, occurrences and
 * exceptions) shares one group by design, so it doesn't count. The two
 * app-wide groups are refused too: removing a team or event member would
 * remove them from the group every volunteer belongs to.
 *
 * Server only: the client may not hold every team, event or config row.
 * Call it only when the group changes, so links made before this rule keep
 * working.
 */
export async function assertWhatsAppGroupAvailable(
  tx: LinkTx,
  groupId: string,
  owner: WhatsAppGroupOwner
): Promise<void> {
  if (tx.location !== "server") {
    return;
  }
  const [teams, events, configRows] = (await Promise.all([
    tx.run(zql.team.where("whatsappGroupId", groupId)),
    tx.run(zql.teamEvent.where("whatsappGroupId", groupId)),
    tx.run(zql.appConfig.where("value", groupId)),
  ])) as [
    { id: string }[],
    { id: string; seriesId: string | null }[],
    { key: string }[],
  ];

  const appWide = APP_WIDE_GROUPS.find((group) =>
    configRows.some((row) => row.key === group.key)
  );
  if (appWide) {
    throw new Error(
      `This WhatsApp group is the app-wide ${appWide.label}, so it can't be linked to a team or event.`
    );
  }
  const otherTeam = teams.some(
    (row) => owner.type !== "team" || row.id !== owner.id
  );
  if (otherTeam) {
    throw new Error("This WhatsApp group is already linked to another team.");
  }
  const otherEvent = events.some(
    (row) =>
      owner.type !== "event" ||
      (row.id !== owner.seriesRootId && row.seriesId !== owner.seriesRootId)
  );
  if (otherEvent) {
    throw new Error("This WhatsApp group is already linked to another event.");
  }
}

/**
 * Add or invite everyone already on a team or event to the group it was just
 * given. The job sends the group_invite template on the Cloud API and adds
 * them through GoWA otherwise. Members of a previous group stay there.
 */
export function pushAddGroupMembersTask(
  ctx: LinkCtx,
  args: {
    entityId: string;
    entityType: "event" | "team";
    groupId: string;
    mutator: string;
    userIds: string[];
  }
): void {
  const { entityId, entityType, groupId, mutator } = args;
  const userIds = [...new Set(args.userIds)];
  if (userIds.length === 0) {
    return;
  }
  ctx.asyncTasks?.push({
    fn: async () => {
      const { enqueue } = await import("@pi-dash/jobs/enqueue");
      await enqueue(
        "whatsapp-add-members",
        { groupId, userIds },
        {
          singletonKey: `whatsapp-link-${entityType}-${entityId}-${groupId}`,
          traceId: ctx.traceId,
        }
      );
    },
    meta: {
      entityId,
      entityType,
      mutator,
      userCount: userIds.length,
      whatsappGroupId: groupId,
    },
  });
}
