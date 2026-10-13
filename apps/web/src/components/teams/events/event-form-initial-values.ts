import type {
  EventInterest,
  EventPartner,
  TeamEvent,
} from "@pi-dash/zero/schema";

import type { EditScope } from "./edit-scope-dialog";
import type { EventDisplayRow } from "./events-table-helpers";

/** An event or occurrence with the relations the edit form prefill reads. */
type PrefillEvent = TeamEvent & {
  interests?: ReadonlyArray<Pick<EventInterest, "status">>;
  partners?: readonly EventPartner[];
};

type RecurrenceRule = { rrule: string; exdates?: string[] } | null | undefined;

/**
 * Partners and the volunteer target as the social API reports them: an
 * exception row falls back to its series parent when it has none of its own.
 */
export function deriveSocialFacts(
  event: PrefillEvent,
  parentEvent: PrefillEvent | undefined
) {
  const own = event.partners ?? [];
  const inherited = event.seriesId ? (parentEvent?.partners ?? []) : [];
  return {
    approvedCount: (event.interests ?? []).filter(
      (interest) => interest.status === "approved"
    ).length,
    partners: own.length > 0 ? own : inherited,
    volunteersNeeded:
      event.volunteersNeeded ?? parentEvent?.volunteersNeeded ?? null,
  };
}

/**
 * Edit form values for `event`. Pass the series parent as `seriesParent` when
 * `event` is an occurrence, so inherited partners and target show.
 */
export function buildEventEditInitialValues(
  event: PrefillEvent,
  recurrence: RecurrenceRule,
  seriesParent: PrefillEvent | undefined,
  editScope: EditScope | null
) {
  // Prefill what the row shows today, including what an exception inherits.
  const social = deriveSocialFacts(event, seriesParent);
  return {
    city: event.city,
    description: event.description,
    endTime: event.endTime,
    feedbackDeadline: event.feedbackDeadline,
    feedbackEnabled: !!event.feedbackEnabled,
    id: event.id,
    inheritVolunteers: !!event.inheritVolunteers,
    isPublic: !!event.isPublic,
    location: event.location,
    name: event.name,
    partners: social.partners,
    postEventNudgesEnabled: event.postEventNudgesEnabled,
    postRsvpPoll: !!event.postRsvpPoll,
    // "following" saves to the series parent, so show its programme.
    programmeId:
      editScope === "following" && seriesParent
        ? seriesParent.programmeId
        : event.programmeId,
    publicArea: event.publicArea,
    recurrenceRule: recurrence,
    reminderIntervals: event.reminderIntervals as number[] | null,
    reminderTarget: event.reminderTarget as string,
    rsvpPollLeadMinutes: event.rsvpPollLeadMinutes,
    seriesId: event.seriesId,
    startTime: event.startTime,
    volunteersNeeded: social.volunteersNeeded,
    whatsappGroupId: event.whatsappGroupId,
  };
}

/** Create form values copying `event` as a new one-off event. */
export function buildEventDuplicateInitialValues(
  event: PrefillEvent,
  seriesParent: PrefillEvent | undefined
) {
  const social = deriveSocialFacts(event, seriesParent);
  return {
    city: event.city,
    description: event.description,
    endTime: event.endTime,
    feedbackDeadline: event.feedbackDeadline,
    feedbackEnabled: !!event.feedbackEnabled,
    id: event.id,
    inheritVolunteers: !event.seriesId && !!event.inheritVolunteers,
    isPublic: !!event.isPublic,
    location: event.location,
    name: `Copy of ${event.name}`,
    partners: social.partners,
    postEventNudgesEnabled: event.postEventNudgesEnabled,
    postRsvpPoll: !!event.postRsvpPoll,
    programmeId: event.programmeId,
    publicArea: event.publicArea,
    recurrenceRule: null,
    reminderIntervals: event.reminderIntervals as number[] | null,
    reminderTarget: event.reminderTarget as string,
    rsvpPollLeadMinutes: event.rsvpPollLeadMinutes,
    seriesId: null,
    startTime: event.startTime,
    volunteersNeeded: social.volunteersNeeded,
    whatsappGroupId: null,
  };
}

/** Team events table: duplicate a row as a new one-off event. */
export function buildRowDuplicateInitialValues(row: EventDisplayRow) {
  // Copy what the row shows: an edited occurrence's own details.
  return {
    ...buildEventDuplicateInitialValues(
      row.exception ?? row.event,
      row.exception ? row.event : undefined
    ),
    endTime: row.endTime,
    id: row.eventId,
    inheritVolunteers: !row.seriesId && !!row.event.inheritVolunteers,
    startTime: row.startTime,
  };
}

/** Team events table: edit form values for a row in `editScope`. */
export function buildRowEditInitialValues(
  row: EventDisplayRow,
  editScope: EditScope | null
) {
  // "following" and "all" save to the series parent, so show its details.
  // "this" on an edited occurrence shows the occurrence's own.
  const occurrence =
    editScope === "following" || editScope === "all"
      ? undefined
      : row.exception;
  return {
    ...buildEventEditInitialValues(
      occurrence ?? row.event,
      row.event.recurrenceRule as { rrule: string; exdates?: string[] } | null,
      occurrence ? row.event : undefined,
      editScope
    ),
    endTime: row.endTime,
    id: row.eventId,
    seriesId: row.seriesId,
    startTime: row.startTime,
  };
}
