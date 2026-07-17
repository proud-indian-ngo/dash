import type { TeamEvent } from "../schema";
import { zql } from "../schema";
import type { Tx } from "./team-event-series";

export async function assertEventNotManagedByKalakriti(
  tx: Pick<Tx, "run">,
  eventId: string
) {
  const event = (await tx.run(zql.teamEvent.where("id", eventId).one())) as
    | TeamEvent
    | undefined;
  if (event?.managementDomain === "kalakriti") {
    throw new Error("Manage this event from Kalakriti");
  }
}
