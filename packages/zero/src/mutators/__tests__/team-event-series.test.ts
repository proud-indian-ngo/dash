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
});
