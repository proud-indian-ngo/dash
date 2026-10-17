import {
  policyVersionOn,
  SAFEGUARDING_GATE_MESSAGE,
} from "@pi-dash/shared/declarations";
import { todayInKolkata } from "@pi-dash/shared/income";

import { zql } from "../schema";

/**
 * The child-safeguarding gate (governance phase 6): nobody joins an event
 * with children (a Kalakriti event, or an event of a team that works with
 * children) without acknowledging the version of every gating policy in
 * force. Checked on the server only: the client can't see other people's
 * acknowledgements. No version in force means no gate.
 */

abstract class BivariantZeroRun {
  abstract bivarianceHack(query: unknown): Promise<unknown>;
}

type ZeroRunFn = BivariantZeroRun["bivarianceHack"];

export interface SafeguardingTx {
  location: "client" | "server";
  run: ZeroRunFn;
}

interface GatingPolicy {
  id: string;
  title: string;
}

interface PolicyVersionRow {
  effectiveOn: number;
  id: string;
  version: number;
}

interface EventForGate {
  managementDomain?: string | null;
  team?: { worksWithChildren?: boolean | null } | null;
}

/** Whether an event involves children. */
export function eventInvolvesChildren(event: EventForGate): boolean {
  return (
    event.managementDomain === "kalakriti" || !!event.team?.worksWithChildren
  );
}

/**
 * Refuses when any of the users hasn't acknowledged a gating policy's
 * version in force. `self` words the refusal for the person joining;
 * otherwise it names the user for whoever adds them.
 */
export async function assertSafeguardingAcknowledged(
  tx: SafeguardingTx,
  userIds: readonly string[],
  options: { self: boolean }
): Promise<void> {
  if (tx.location !== "server" || userIds.length === 0) {
    return;
  }
  const policies = (await tx.run(
    zql.policy.where("gatesChildren", true)
  )) as GatingPolicy[];
  const today = todayInKolkata();
  for (const p of policies) {
    const versions = (await tx.run(
      zql.policyVersion.where("policyId", p.id)
    )) as PolicyVersionRow[];
    const inForce = policyVersionOn(
      versions.map((v) => ({
        effectiveOn: new Date(v.effectiveOn).toISOString().slice(0, 10),
        id: v.id,
        version: v.version,
      })),
      today
    );
    if (!inForce) {
      continue;
    }
    for (const userId of userIds) {
      const acknowledged = await tx.run(
        zql.policyAcknowledgement
          .where("policyVersionId", inForce.id)
          .where("userId", userId)
          .one()
      );
      if (acknowledged) {
        continue;
      }
      if (options.self) {
        throw new Error(SAFEGUARDING_GATE_MESSAGE);
      }
      const person = (await tx.run(zql.user.where("id", userId).one())) as
        | { name?: string | null }
        | undefined;
      throw new Error(
        `${person?.name ?? "This person"} hasn't acknowledged the current ${p.title}, so they can't join events with children yet.`
      );
    }
  }
}

/** The gate for joining one event: applies only when the event involves children. */
export async function assertSafeToJoinEvent(
  tx: SafeguardingTx,
  eventId: string,
  userIds: readonly string[],
  options: { self: boolean }
): Promise<void> {
  if (tx.location !== "server") {
    return;
  }
  const event = (await tx.run(zql.teamEvent.where("id", eventId).one())) as
    | { managementDomain?: string | null; teamId: string }
    | undefined;
  if (!event) {
    return;
  }
  const team = (await tx.run(zql.team.where("id", event.teamId).one())) as
    | { worksWithChildren?: boolean | null }
    | undefined;
  if (eventInvolvesChildren({ ...event, team })) {
    await assertSafeguardingAcknowledged(tx, userIds, options);
  }
}
