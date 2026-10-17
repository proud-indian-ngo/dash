import { describe, expect, it } from "bun:test";

import type { EventPartner, TeamEvent } from "@pi-dash/zero/schema";

import {
  buildRowDuplicateInitialValues,
  buildRowEditInitialValues,
  buildScopedEditInitialValues,
} from "./event-form-initial-values";
import type { EventRow, ExceptionRow } from "./events-table-helpers";
import {
  buildEventDisplayRows,
  getRowDetails,
  searchDisplayRow,
} from "./events-table-helpers";

const HOUR = 60 * 60 * 1000;
// Saturday 2026-01-03 10:00 local time; weekly on Saturdays.
const SERIES_START = new Date(2026, 0, 3, 10, 0, 0).getTime();
const OCC_DATE = "2026-01-10";
const OCC_START = new Date(2026, 0, 10, 10, 0, 0).getTime();

function baseEvent(overrides: Partial<TeamEvent>): TeamEvent {
  return {
    cancelledAt: null,
    childrenAttended: null,
    costCentreId: "cc-blr",
    createdAt: 0,
    createdBy: "user-1",
    description: "Series description",
    endTime: SERIES_START + 2 * HOUR,
    feedbackDeadline: null,
    feedbackEnabled: false,
    id: "series-1",
    inheritVolunteers: false,
    isPublic: true,
    location: "Series hall",
    managementDomain: null,
    name: "Weekly class",
    originalDate: null,
    postEventNudgesEnabled: true,
    postRsvpPoll: false,
    programmeId: "programme-series",
    publicArea: "Indiranagar",
    recurrenceRule: null,
    reminderIntervals: null,
    reminderTarget: "group",
    rsvpPollLeadMinutes: 60,
    seriesId: null,
    socialCompletedAt: null,
    socialNotes: null,
    startTime: SERIES_START,
    teamId: "team-1",
    updatedAt: 0,
    volunteersNeeded: 6,
    ...overrides,
  } as TeamEvent;
}

function partner(id: string, name: string): EventPartner {
  return {
    createdAt: 0,
    eventId: "series-1",
    id,
    instagram: null,
    linkedin: null,
    name,
  } as unknown as EventPartner;
}

function makeException(overrides: Partial<ExceptionRow> = {}): ExceptionRow {
  return {
    ...baseEvent({
      costCentreId: "cc-mum",
      description: "Own description",
      endTime: OCC_START + 3 * HOUR,
      id: "exception-1",
      isPublic: false,
      location: "Own hall",
      name: "Renamed session",
      originalDate: OCC_DATE,
      programmeId: "programme-own",
      publicArea: null,
      seriesId: "series-1",
      startTime: OCC_START,
      volunteersNeeded: null,
    }),
    members: [],
    partners: [],
    programme: undefined,
    whatsappGroup: undefined,
    ...overrides,
  };
}

function makeSeries(exception: ExceptionRow): EventRow {
  return {
    ...baseEvent({
      recurrenceRule: { rrule: "FREQ=WEEKLY;BYDAY=SA;COUNT=3" },
    }),
    exceptions: [exception],
    members: [],
    partners: [partner("p1", "Series partner")],
    programme: undefined,
    whatsappGroup: undefined,
  };
}

function rowsFor(exception = makeException()) {
  const rows = buildEventDisplayRows(
    [makeSeries(exception)],
    new Date(2026, 1, 1)
  );
  const exceptionRow = rows.find((row) => row.eventId === "exception-1");
  const virtualRow = rows.find((row) => row.isVirtual);
  if (!(exceptionRow && virtualRow)) {
    throw new Error("expected an exception row and a virtual row");
  }
  return { exceptionRow, rows, virtualRow };
}

describe("buildEventDisplayRows", () => {
  it("exposes an edited occurrence on its row and keeps the series as event", () => {
    const { exceptionRow } = rowsFor();
    expect(exceptionRow.exception?.id).toBe("exception-1");
    expect(exceptionRow.event.id).toBe("series-1");
    expect(exceptionRow.seriesId).toBe("series-1");
  });

  it("shows and searches an edited occurrence by its own details", () => {
    const { exceptionRow, virtualRow } = rowsFor();
    const details = getRowDetails(exceptionRow);
    expect(details.name).toBe("Renamed session");
    expect(details.location).toBe("Own hall");
    expect(details.costCentreId).toBe("cc-mum");
    expect(details.isPublic).toBe(false);
    expect(searchDisplayRow(exceptionRow, "renamed")).toBe(true);
    expect(searchDisplayRow(exceptionRow, "weekly class")).toBe(false);
    expect(searchDisplayRow(exceptionRow, "own description")).toBe(true);

    expect(virtualRow.exception).toBeUndefined();
    expect(getRowDetails(virtualRow).name).toBe("Weekly class");
  });
});

describe("buildRowEditInitialValues", () => {
  it('prefills an edited occurrence\'s own details for "this"', () => {
    const { exceptionRow } = rowsFor();
    const values = buildRowEditInitialValues(exceptionRow, "this");
    expect(values).toMatchObject({
      costCentreId: "cc-mum",
      description: "Own description",
      endTime: OCC_START + 3 * HOUR,
      id: "exception-1",
      isPublic: false,
      location: "Own hall",
      name: "Renamed session",
      programmeId: "programme-own",
      // Null keeps inheriting the series' area.
      publicArea: null,
      seriesId: "series-1",
      startTime: OCC_START,
    });
    // An occurrence without its own partners and target shows the series'.
    expect(values.partners.map((p) => p.name)).toEqual(["Series partner"]);
    expect(values.volunteersNeeded).toBe(6);
  });

  it("prefills an occurrence's own partners and target when it has them", () => {
    const { exceptionRow } = rowsFor(
      makeException({
        partners: [partner("p2", "Own partner")],
        volunteersNeeded: 2,
      })
    );
    const values = buildRowEditInitialValues(exceptionRow, "this");
    expect(values.partners.map((p) => p.name)).toEqual(["Own partner"]);
    expect(values.volunteersNeeded).toBe(2);
  });

  it('matches the event page prefill for "this" on the same occurrence', () => {
    const { exceptionRow } = rowsFor();
    const exception = exceptionRow.exception as ExceptionRow;
    const teamPage = buildRowEditInitialValues(exceptionRow, "this");
    const eventPage = buildScopedEditInitialValues(
      exception,
      exceptionRow.event,
      "this"
    );
    expect(eventPage).toEqual(teamPage);
  });

  it.each(["following", "all"] as const)(
    'prefills the series\' details for "%s"',
    (scope) => {
      const { exceptionRow } = rowsFor();
      const values = buildRowEditInitialValues(exceptionRow, scope);
      expect(values).toMatchObject({
        costCentreId: "cc-blr",
        description: "Series description",
        id: "exception-1",
        isPublic: true,
        location: "Series hall",
        name: "Weekly class",
        programmeId: "programme-series",
        publicArea: "Indiranagar",
        recurrenceRule: { rrule: "FREQ=WEEKLY;BYDAY=SA;COUNT=3" },
        seriesId: "series-1",
        startTime: scope === "all" ? SERIES_START : OCC_START,
        volunteersNeeded: 6,
      });
      expect(values.partners.map((p) => p.name)).toEqual(["Series partner"]);
    }
  );

  it('keeps the series\' times for "all" so the series start does not move', () => {
    const { exceptionRow, virtualRow } = rowsFor();
    for (const row of [exceptionRow, virtualRow]) {
      const values = buildRowEditInitialValues(row, "all");
      expect(values.startTime).toBe(SERIES_START);
      expect(values.endTime).toBe(SERIES_START + 2 * HOUR);
    }
  });

  it('starts a "following" split at the row\'s occurrence', () => {
    const { virtualRow } = rowsFor();
    const values = buildRowEditInitialValues(virtualRow, "following");
    expect(values.startTime).toBe(virtualRow.startTime);
    expect(values.endTime).toBe(virtualRow.endTime);
  });

  it("prefills a virtual occurrence from its series at the occurrence's time", () => {
    const { virtualRow } = rowsFor();
    const values = buildRowEditInitialValues(virtualRow, "this");
    expect(values).toMatchObject({
      id: "series-1",
      name: "Weekly class",
      programmeId: "programme-series",
      seriesId: "series-1",
      startTime: virtualRow.startTime,
    });
  });

  it("prefills a one-off event from itself", () => {
    const event: EventRow = {
      ...baseEvent({ id: "one-off", name: "One-off" }),
      exceptions: [],
      members: [],
      partners: [partner("p3", "One-off partner")],
      whatsappGroup: undefined,
    };
    const [row] = buildEventDisplayRows([event], new Date(2026, 1, 1));
    if (!row) {
      throw new Error("expected a row");
    }
    const values = buildRowEditInitialValues(row, null);
    expect(values).toMatchObject({
      id: "one-off",
      name: "One-off",
      seriesId: null,
      volunteersNeeded: 6,
    });
    expect(values.partners.map((p) => p.name)).toEqual(["One-off partner"]);
  });
});

describe("buildScopedEditInitialValues", () => {
  it.each(["following", "all"] as const)(
    'prefills the series\' details and rule for "%s" from an edited occurrence',
    (scope) => {
      const { exceptionRow } = rowsFor();
      const values = buildScopedEditInitialValues(
        exceptionRow.exception as ExceptionRow,
        exceptionRow.event,
        scope
      );
      expect(values).toMatchObject({
        costCentreId: "cc-blr",
        description: "Series description",
        id: "series-1",
        isPublic: true,
        location: "Series hall",
        name: "Weekly class",
        programmeId: "programme-series",
        publicArea: "Indiranagar",
        recurrenceRule: { rrule: "FREQ=WEEKLY;BYDAY=SA;COUNT=3" },
        volunteersNeeded: 6,
      });
      expect(values?.partners.map((p) => p.name)).toEqual(["Series partner"]);
    }
  );

  it('starts a "following" split at the edited occurrence', () => {
    const { exceptionRow } = rowsFor();
    const values = buildScopedEditInitialValues(
      exceptionRow.exception as ExceptionRow,
      exceptionRow.event,
      "following"
    );
    expect(values?.startTime).toBe(OCC_START);
    expect(values?.endTime).toBe(OCC_START + 3 * HOUR);
  });

  it.each(["following", "all"] as const)(
    'refuses "%s" from an edited occurrence whose series has not loaded',
    (scope) => {
      const { exceptionRow } = rowsFor();
      expect(
        buildScopedEditInitialValues(
          exceptionRow.exception as ExceptionRow,
          undefined,
          scope
        )
      ).toBeNull();
    }
  );

  it('prefills "this" from an edited occurrence before its series loads', () => {
    const { exceptionRow } = rowsFor();
    const values = buildScopedEditInitialValues(
      exceptionRow.exception as ExceptionRow,
      undefined,
      "this"
    );
    expect(values?.name).toBe("Renamed session");
  });

  it('keeps the series\' times for "all"', () => {
    const { exceptionRow } = rowsFor();
    const values = buildScopedEditInitialValues(
      exceptionRow.exception as ExceptionRow,
      exceptionRow.event,
      "all"
    );
    expect(values?.startTime).toBe(SERIES_START);
    expect(values?.endTime).toBe(SERIES_START + 2 * HOUR);
  });
});

describe("buildRowDuplicateInitialValues", () => {
  it("copies what an edited occurrence's row shows", () => {
    const { exceptionRow } = rowsFor();
    expect(buildRowDuplicateInitialValues(exceptionRow)).toMatchObject({
      costCentreId: "cc-mum",
      location: "Own hall",
      name: "Copy of Renamed session",
      programmeId: "programme-own",
      recurrenceRule: null,
      seriesId: null,
      startTime: OCC_START,
    });
  });
});
