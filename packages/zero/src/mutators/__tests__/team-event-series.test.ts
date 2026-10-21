import { describe, expect, it } from "bun:test";

import { expandSeries } from "@pi-dash/shared/rrule-expand";

import { formStateToRRule, rruleToFormState } from "../../lib/rrule-utils";
import {
  buildExceptionInsert,
  buildTruncatedRRule,
  buildUpdateFields,
} from "../team-event-series";

const NOW = 1_700_000_000_000;

describe("buildTruncatedRRule", () => {
  it("ends the rule the second before the split date starts (UTC)", () => {
    const result = buildTruncatedRRule("FREQ=WEEKLY;BYDAY=SA", "2026-04-15");
    expect(result).toBe("FREQ=WEEKLY;BYDAY=SA;UNTIL=20260414T235959Z");
  });

  it("replaces existing UNTIL", () => {
    const result = buildTruncatedRRule(
      "FREQ=MONTHLY;BYDAY=1SA;UNTIL=20261231T235959Z",
      "2026-06-01"
    );
    expect(result).toBe("FREQ=MONTHLY;BYDAY=1SA;UNTIL=20260531T235959Z");
  });

  it("drops COUNT, so a later edit keeps the series ended", () => {
    const cut = buildTruncatedRRule("FREQ=WEEKLY;COUNT=10", "2026-04-15");
    expect(cut).toBe("FREQ=WEEKLY;UNTIL=20260414T235959Z");
    const form = rruleToFormState(cut);
    expect(form).toMatchObject({ endType: "until", until: "2026-04-14" });
    expect(formStateToRRule(form)).toBe("FREQ=WEEKLY;UNTIL=20260414T235959Z");
  });

  it("crosses year and leap-day boundaries", () => {
    expect(buildTruncatedRRule("FREQ=WEEKLY", "2026-01-01")).toBe(
      "FREQ=WEEKLY;UNTIL=20251231T235959Z"
    );
    expect(buildTruncatedRRule("FREQ=DAILY", "2025-03-01")).toBe(
      "FREQ=DAILY;UNTIL=20250228T235959Z"
    );
    expect(buildTruncatedRRule("FREQ=DAILY", "2024-03-01")).toBe(
      "FREQ=DAILY;UNTIL=20240229T235959Z"
    );
  });

  const datesUntil = (start: number, split: string) =>
    expandSeries(
      { rrule: buildTruncatedRRule("FREQ=DAILY", split) },
      start,
      null,
      start,
      start + 10 * 86_400_000
    ).map((occ) => occ.date);

  it("moves a midnight-UTC session on the split date off the old series", () => {
    expect(datesUntil(Date.UTC(2026, 3, 13, 0, 0), "2026-04-15")).toEqual([
      "2026-04-13",
      "2026-04-14",
    ]);
  });

  it("keeps the day before when the series runs at 23:30Z", () => {
    expect(datesUntil(Date.UTC(2026, 3, 13, 23, 30), "2026-04-15")).toEqual([
      "2026-04-13",
      "2026-04-14",
    ]);
  });
});

const SERIES_BASE = {
  cancelledAt: null,
  childrenAttended: null,
  costCentreId: "cc-blr",
  createdAt: NOW,
  createdBy: "user-1",
  description: "Team standup",
  endTime: NOW + 3_600_000,
  feedbackDeadline: null,
  feedbackEnabled: true,
  id: "series-1",
  inheritVolunteers: false,
  isPublic: false,
  location: "Office",
  managementDomain: null,
  name: "Weekly Meeting",
  originalDate: null,
  postEventNudgesEnabled: true,
  postRsvpPoll: false,
  programmeId: "prog-1",
  projectId: "proj-1" as string | null,
  publicArea: "Iblur",
  recurrenceRule: { rrule: "FREQ=WEEKLY" },
  reminderIntervals: [60, 1440],
  reminderTarget: "group" as const,
  rsvpPollLeadMinutes: 4320,
  seriesId: null,
  socialCompletedAt: null,
  socialNotes: null,
  startTime: NOW,
  teamId: "team-1",
  updatedAt: NOW,
  volunteersNeeded: null,
  whatsappGroupId: "wg-1",
};

describe("buildExceptionInsert", () => {
  it("stores null when a session's public area is cleared", () => {
    expect(
      buildExceptionInsert("exc-9", SERIES_BASE, "2026-04-15", "u", NOW, {
        publicArea: "",
      }).publicArea
    ).toBeNull();
    expect(
      buildExceptionInsert("exc-9", SERIES_BASE, "2026-04-15", "u", NOW, {
        publicArea: "HSR Layout",
      }).publicArea
    ).toBe("HSR Layout");
  });

  it("moves an occurrence to another programme only when asked", () => {
    expect(
      buildExceptionInsert("exc-2", SERIES_BASE, "2026-04-15", "u", NOW, {
        programmeId: "prog-2",
      }).programmeId
    ).toBe("prog-2");
    expect(buildUpdateFields({ id: "e", now: NOW })).not.toHaveProperty(
      "programmeId"
    );
    expect(
      buildUpdateFields({ id: "e", now: NOW, programmeId: "prog-2" })
        .programmeId
    ).toBe("prog-2");
  });

  it("copies the series' project unless the exception sets or clears it", () => {
    const insert = (projectId?: string | null) =>
      buildExceptionInsert("exc-1", SERIES_BASE, "2026-04-15", "u", NOW, {
        ...(projectId !== undefined && { projectId }),
      }).projectId;
    expect(insert()).toBe("proj-1");
    expect(insert("proj-2")).toBe("proj-2");
    expect(insert(null)).toBeNull();
    expect(buildUpdateFields({ id: "e", now: NOW })).not.toHaveProperty(
      "projectId"
    );
    expect(
      buildUpdateFields({ id: "e", now: NOW, projectId: null }).projectId
    ).toBeNull();
  });

  it("copies the series' cost centre unless the exception picks another", () => {
    expect(
      buildExceptionInsert("exc-1", SERIES_BASE, "2026-04-15", "u", NOW)
        .costCentreId
    ).toBe("cc-blr");
    expect(
      buildExceptionInsert("exc-1", SERIES_BASE, "2026-04-15", "u", NOW, {
        costCentreId: "cc-mum",
      }).costCentreId
    ).toBe("cc-mum");
  });

  it("clears a public area to null on update", () => {
    expect(buildUpdateFields({ id: "e", now: NOW, publicArea: "" })).toEqual(
      expect.objectContaining({ publicArea: null })
    );
  });

  it("inherits all fields from series with no overrides", () => {
    const result = buildExceptionInsert(
      "exc-1",
      SERIES_BASE,
      "2026-04-15",
      "user-2",
      NOW + 1000
    );

    expect(result.id).toBe("exc-1");
    expect(result.teamId).toBe("team-1");
    expect(result.name).toBe("Weekly Meeting");
    expect(result.description).toBe("Team standup");
    expect(result.location).toBe("Office");
    expect(result.costCentreId).toBe("cc-blr");
    expect(result.startTime).toBe(NOW);
    expect(result.endTime).toBe(NOW + 3_600_000);
    expect(result.isPublic).toBe(false);
    expect(result.recurrenceRule).toBeNull();
    expect(result.seriesId).toBe("series-1");
    expect(result.originalDate).toBe("2026-04-15");
    expect(result.cancelledAt).toBeNull();
    expect(result.feedbackEnabled).toBe(true);
    expect(result.postRsvpPoll).toBe(false);
    expect(result.publicArea).toBe("Iblur");
    expect(result.reminderIntervals).toEqual([60, 1440]);
    expect(result.reminderTarget).toBe("group");
    expect(result.postEventNudgesEnabled).toBe(true);
    expect(result.whatsappGroupId).toBe("wg-1");
    expect(result.programmeId).toBe("prog-1");
    expect(result.inheritVolunteers).toBe(false);
    expect(result.createdBy).toBe("user-2");
    expect(result.createdAt).toBe(NOW + 1000);
    expect(result.updatedAt).toBe(NOW + 1000);
  });

  it("propagates inheritVolunteers from series to exception", () => {
    const seriesWithInherit = {
      ...SERIES_BASE,
      inheritVolunteers: true,
    };
    const result = buildExceptionInsert(
      "exc-inherit",
      seriesWithInherit,
      "2026-06-01",
      "user-1",
      NOW
    );
    expect(result.inheritVolunteers).toBe(true);
  });

  it("applies overrides over series values", () => {
    const result = buildExceptionInsert(
      "exc-2",
      SERIES_BASE,
      "2026-04-22",
      "user-3",
      NOW + 2000,
      {
        cancelledAt: NOW + 2000,
        location: "Conference Room B",
        name: "Special Meeting",
        startTime: NOW + 7_200_000,
      }
    );

    expect(result.name).toBe("Special Meeting");
    expect(result.location).toBe("Conference Room B");
    expect(result.startTime).toBe(NOW + 7_200_000);
    expect(result.cancelledAt).toBe(NOW + 2000);
    // Non-overridden fields still come from series
    expect(result.description).toBe("Team standup");
    expect(result.isPublic).toBe(false);
  });

  it("handles series with null optional fields", () => {
    const spareSeries = {
      ...SERIES_BASE,
      description: null,
      endTime: null,
      feedbackDeadline: null,
      location: null,
      reminderIntervals: null,
      whatsappGroupId: null,
    };

    const result = buildExceptionInsert(
      "exc-3",
      spareSeries,
      "2026-05-01",
      "user-1",
      NOW
    );

    expect(result.description).toBeNull();
    expect(result.location).toBeNull();
    expect(result.endTime).toBeNull();
    expect(result.feedbackDeadline).toBeNull();
    expect(result.reminderIntervals).toBeNull();
    expect(result.whatsappGroupId).toBeNull();
    expect(result.reminderTarget).toBe("group");
  });

  it("applies reminderTarget override", () => {
    const result = buildExceptionInsert(
      "exc-4",
      SERIES_BASE,
      "2026-05-08",
      "user-1",
      NOW,
      { reminderTarget: "both" }
    );
    expect(result.reminderTarget).toBe("both");
  });

  it("falls back to 'group' when series has no reminderTarget", () => {
    const seriesWithoutTarget = {
      ...SERIES_BASE,
      reminderTarget: null,
    };
    const result = buildExceptionInsert(
      "exc-5",
      seriesWithoutTarget,
      "2026-05-15",
      "user-1",
      NOW
    );
    expect(result.reminderTarget).toBe("group");
  });

  it("overrides postEventNudgesEnabled", () => {
    const result = buildExceptionInsert(
      "exc-6",
      SERIES_BASE,
      "2026-05-22",
      "user-1",
      NOW,
      { postEventNudgesEnabled: false }
    );
    expect(result.postEventNudgesEnabled).toBe(false);
  });
});

describe("buildUpdateFields", () => {
  it("includes only provided fields plus updatedAt", () => {
    const result = buildUpdateFields({
      id: "evt-1",
      name: "Renamed",
      now: NOW,
    });

    expect(result.id).toBe("evt-1");
    expect(result.updatedAt).toBe(NOW);
    expect(result.name).toBe("Renamed");
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("location");
    expect(result).not.toHaveProperty("startTime");
  });

  it("coerces empty description to null", () => {
    const result = buildUpdateFields({
      description: "",
      id: "evt-1",
      now: NOW,
    });
    expect(result.description).toBeNull();
  });

  it("coerces empty location to null", () => {
    const result = buildUpdateFields({
      id: "evt-1",
      location: "",
      now: NOW,
    });
    expect(result.location).toBeNull();
  });

  it("coerces empty whatsappGroupId to null", () => {
    const result = buildUpdateFields({
      id: "evt-1",
      now: NOW,
      whatsappGroupId: "",
    });
    expect(result.whatsappGroupId).toBeNull();
  });

  it("passes through null feedbackDeadline", () => {
    const result = buildUpdateFields({
      feedbackDeadline: null,
      id: "evt-1",
      now: NOW,
    });
    expect(result.feedbackDeadline).toBeNull();
  });

  it("passes through null reminderIntervals", () => {
    const result = buildUpdateFields({
      id: "evt-1",
      now: NOW,
      reminderIntervals: null,
    });
    expect(result.reminderIntervals).toBeNull();
  });

  it("includes all fields when fully specified", () => {
    const result = buildUpdateFields({
      costCentreId: "cc-mum",
      description: "desc",
      endTime: NOW + 2000,
      feedbackDeadline: NOW + 86_400_000,
      feedbackEnabled: true,
      id: "evt-1",
      isPublic: true,
      location: "loc",
      name: "Full Update",
      now: NOW,
      postRsvpPoll: true,
      reminderIntervals: [30, 60],
      reminderTarget: "both",
      rsvpPollLeadMinutes: 1440,
      startTime: NOW + 1000,
      whatsappGroupId: "wg-2",
    });

    expect(result.name).toBe("Full Update");
    expect(result.description).toBe("desc");
    expect(result.location).toBe("loc");
    expect(result.costCentreId).toBe("cc-mum");
    expect(result.startTime).toBe(NOW + 1000);
    expect(result.endTime).toBe(NOW + 2000);
    expect(result.isPublic).toBe(true);
    expect(result.feedbackEnabled).toBe(true);
    expect(result.feedbackDeadline).toBe(NOW + 86_400_000);
    expect(result.postRsvpPoll).toBe(true);
    expect(result.rsvpPollLeadMinutes).toBe(1440);
    expect(result.reminderIntervals).toEqual([30, 60]);
    expect(result.reminderTarget).toBe("both");
    expect(result.whatsappGroupId).toBe("wg-2");
    expect(result.updatedAt).toBe(NOW);
  });

  it("includes reminderTarget when provided", () => {
    const result = buildUpdateFields({
      id: "evt-1",
      now: NOW,
      reminderTarget: "participants",
    });
    expect(result.reminderTarget).toBe("participants");
  });

  it("omits reminderTarget when not provided", () => {
    const result = buildUpdateFields({
      id: "evt-1",
      now: NOW,
    });
    expect(result).not.toHaveProperty("reminderTarget");
  });
});
