import { describe, expect, it } from "vitest";
import {
  buildExceptionInsert,
  buildTruncatedRRule,
  buildUpdateFields,
} from "../team-event-series";

const NOW = 1_700_000_000_000;

describe("buildTruncatedRRule", () => {
  it("appends UNTIL one day before split date", () => {
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

  it("handles January 1st split (rolls back to previous year)", () => {
    const result = buildTruncatedRRule("FREQ=WEEKLY", "2026-01-01");
    expect(result).toBe("FREQ=WEEKLY;UNTIL=20251231T235959Z");
  });

  it("handles March 1st split in non-leap year", () => {
    const result = buildTruncatedRRule("FREQ=DAILY", "2025-03-01");
    expect(result).toBe("FREQ=DAILY;UNTIL=20250228T235959Z");
  });

  it("handles March 1st split in leap year", () => {
    const result = buildTruncatedRRule("FREQ=DAILY", "2024-03-01");
    expect(result).toBe("FREQ=DAILY;UNTIL=20240229T235959Z");
  });
});

const SERIES_BASE = {
  id: "series-1",
  teamId: "team-1",
  type: "event" as const,
  name: "Weekly Meeting",
  description: "Team standup",
  location: "Office",
  city: "bangalore" as const,
  startTime: NOW,
  endTime: NOW + 3_600_000,
  isPublic: false,
  recurrenceRule: { rrule: "FREQ=WEEKLY" },
  seriesId: null,
  originalDate: null,
  cancelledAt: null,
  feedbackEnabled: true,
  feedbackDeadline: null,
  postRsvpPoll: false,
  rsvpPollLeadMinutes: 4320,
  reminderIntervals: [60, 1440],
  whatsappGroupId: "wg-1",
  centerId: null,
  createdBy: "user-1",
  createdAt: NOW,
  updatedAt: NOW,
};

describe("buildExceptionInsert", () => {
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
    expect(result.city).toBe("bangalore");
    expect(result.startTime).toBe(NOW);
    expect(result.endTime).toBe(NOW + 3_600_000);
    expect(result.isPublic).toBe(false);
    expect(result.recurrenceRule).toBeNull();
    expect(result.seriesId).toBe("series-1");
    expect(result.originalDate).toBe("2026-04-15");
    expect(result.cancelledAt).toBeNull();
    expect(result.feedbackEnabled).toBe(true);
    expect(result.postRsvpPoll).toBe(false);
    expect(result.reminderIntervals).toEqual([60, 1440]);
    expect(result.whatsappGroupId).toBe("wg-1");
    expect(result.createdBy).toBe("user-2");
    expect(result.createdAt).toBe(NOW + 1000);
    expect(result.updatedAt).toBe(NOW + 1000);
  });

  it("applies overrides over series values", () => {
    const result = buildExceptionInsert(
      "exc-2",
      SERIES_BASE,
      "2026-04-22",
      "user-3",
      NOW + 2000,
      {
        name: "Special Meeting",
        location: "Conference Room B",
        startTime: NOW + 7_200_000,
        cancelledAt: NOW + 2000,
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
      location: null,
      endTime: null,
      feedbackDeadline: null,
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
  });
});

describe("buildUpdateFields", () => {
  it("includes only provided fields plus updatedAt", () => {
    const result = buildUpdateFields({
      id: "evt-1",
      now: NOW,
      name: "Renamed",
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
      id: "evt-1",
      now: NOW,
      description: "",
    });
    expect(result.description).toBeNull();
  });

  it("coerces empty location to null", () => {
    const result = buildUpdateFields({
      id: "evt-1",
      now: NOW,
      location: "",
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
      id: "evt-1",
      now: NOW,
      feedbackDeadline: null,
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
      id: "evt-1",
      now: NOW,
      name: "Full Update",
      description: "desc",
      location: "loc",
      city: "mumbai",
      startTime: NOW + 1000,
      endTime: NOW + 2000,
      isPublic: true,
      feedbackEnabled: true,
      feedbackDeadline: NOW + 86_400_000,
      postRsvpPoll: true,
      rsvpPollLeadMinutes: 1440,
      reminderIntervals: [30, 60],
      whatsappGroupId: "wg-2",
    });

    expect(result.name).toBe("Full Update");
    expect(result.description).toBe("desc");
    expect(result.location).toBe("loc");
    expect(result.city).toBe("mumbai");
    expect(result.startTime).toBe(NOW + 1000);
    expect(result.endTime).toBe(NOW + 2000);
    expect(result.isPublic).toBe(true);
    expect(result.feedbackEnabled).toBe(true);
    expect(result.feedbackDeadline).toBe(NOW + 86_400_000);
    expect(result.postRsvpPoll).toBe(true);
    expect(result.rsvpPollLeadMinutes).toBe(1440);
    expect(result.reminderIntervals).toEqual([30, 60]);
    expect(result.whatsappGroupId).toBe("wg-2");
    expect(result.updatedAt).toBe(NOW);
  });
});
