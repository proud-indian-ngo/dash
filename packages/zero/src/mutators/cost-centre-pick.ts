import { type Transaction } from "@rocicorp/zero";

import { type Schema, zql } from "../schema";

type Tx = Transaction<Schema>;

/**
 * The cost centre ("City") a record keeps after a write. A pick must be an
 * existing, active centre; keeping the record's current one is always
 * allowed, so an old Mumbai record stays Mumbai unless an active centre is
 * picked. Without a pick, the record keeps its current centre, else takes
 * the only active one; with several active, the server asks for a choice.
 * On the client the cache may not hold the rows yet, so only the server
 * enforces existence (as for programmes).
 */
export async function pickCostCentreId(
  tx: Tx,
  requested: string | null | undefined,
  current: string | null = null
): Promise<string | null> {
  if (requested) {
    if (requested === current) {
      return requested;
    }
    const centre = await tx.run(zql.costCentre.where("id", requested).one());
    if (!centre) {
      if (tx.location === "server") {
        throw new Error("City not found");
      }
      return requested;
    }
    if (centre.active === false) {
      throw new Error("Choose an active city");
    }
    return requested;
  }
  if (current) {
    return current;
  }
  const active = await tx.run(zql.costCentre.where("active", true));
  if (active.length > 1) {
    if (tx.location === "server") {
      throw new Error("Choose the city");
    }
    return null;
  }
  return active[0]?.id ?? null;
}

export const CLOSED_EVENT_CITY_MESSAGE =
  "That event's city is closed. Choose an event in an active city";

/**
 * A request may be linked anew to an event only in an active cost centre;
 * one already on an event in a closed city keeps it. On the client the
 * event or centre may not have synced, so only the server enforces it.
 */
async function assertEventCityOpen(
  tx: Tx,
  eventId: string | null | undefined,
  currentEventId: string | null | undefined
): Promise<void> {
  if (!eventId || eventId === currentEventId) {
    return;
  }
  const event = await tx.run(zql.teamEvent.where("id", eventId).one());
  if (!event?.costCentreId) {
    return;
  }
  const centre = await tx.run(
    zql.costCentre.where("id", event.costCentreId).one()
  );
  if (centre?.active === false) {
    throw new Error(CLOSED_EVENT_CITY_MESSAGE);
  }
}

interface RequestCostCentre {
  costCentreId?: string | null;
  eventId?: string | null;
}

/**
 * A request's own cost centre: none when it is linked to an event (it reads
 * the event's, which must be active unless it is the request's current
 * event), else the pick as `pickCostCentreId` allows it.
 */
export async function pickRequestCostCentreId(
  tx: Tx,
  input: RequestCostCentre,
  current: RequestCostCentre | null = null
): Promise<string | null> {
  if (input.eventId) {
    await assertEventCityOpen(tx, input.eventId, current?.eventId);
    return null;
  }
  return await pickCostCentreId(
    tx,
    input.costCentreId,
    current?.costCentreId ?? null
  );
}

/**
 * A request's own cost centre after finance re-charges it (`setChargedTo`,
 * which has no city picker): none on an event; moving off an event it keeps
 * the event's cost centre, the one it was counted under; otherwise its own.
 */
export async function costCentreAfterRecharge(
  tx: Tx,
  entity: { costCentreId?: string | null; eventId?: string | null },
  nextEventId: string | null
): Promise<string | null> {
  if (nextEventId) {
    await assertEventCityOpen(tx, nextEventId, entity.eventId);
    return null;
  }
  if (entity.eventId) {
    const event = await tx.run(zql.teamEvent.where("id", entity.eventId).one());
    if (event?.costCentreId) {
      return event.costCentreId;
    }
  }
  return await pickCostCentreId(tx, null, entity.costCentreId ?? null);
}
