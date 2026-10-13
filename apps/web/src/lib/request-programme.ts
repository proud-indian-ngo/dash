import type { Programme, TeamEvent } from "@pi-dash/zero/schema";

/** A request's event, with the programme the request inherits from it. */
export type RequestEvent = TeamEvent & { programme?: Programme | undefined };

/** Filter value and label for requests without an event, which have no programme. */
const NO_EVENT_VALUE = "no-event";
const NO_EVENT_LABEL = "No event";

/** A request has no programme of its own; it is the event's programme. */
export function requestProgrammeId(
  event: { programmeId?: string | null } | null | undefined
): string {
  return event?.programmeId ?? NO_EVENT_VALUE;
}

/** Empty while the event's programme is still loading. */
export function requestProgrammeName(
  event: { programme?: { name: string } | null } | null | undefined
): string {
  return event ? (event.programme?.name ?? "") : NO_EVENT_LABEL;
}
