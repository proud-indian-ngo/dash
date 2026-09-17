import { describe, expect, it } from "bun:test";

import { validateKalakritiSessionSchedule } from "@pi-dash/shared/kalakriti";

import { previewCompetitionSchedules } from "./kalakriti-competition-schedule";
const formatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Kolkata",
  year: "numeric",
});
const start = Date.parse("2026-09-20T09:00:00+05:30");
const existing = {
  id: "session",
  divisionId: "junior",
  venueId: "hall",
  startAt: start,
  endAt: start + 3600000,
  cancelledAt: 1,
};
const draft = {
  id: "junior",
  venueId: "hall",
  startAt: "2026-09-20T09:00",
  endAt: "2026-09-20T10:00",
};
describe("Competition schedule editor", () => {
  it("does not reactivate or validate unchanged cancelled Sessions", () => {
    const active = {
      ...existing,
      id: "other",
      divisionId: "senior",
      cancelledAt: null,
    };
    const preview = previewCompetitionSchedules(
      [draft],
      [existing, active],
      formatter
    );
    expect(preview.drafts[0]?.changed).toBe(false);
    expect(preview.drafts[0]?.cancelledAt).toBe(1);
    expect(
      validateKalakritiSessionSchedule(
        active,
        "2026-09-20",
        "Asia/Kolkata",
        preview.finalSchedule
      )
    ).toEqual({ valid: true });
  });
  it("keeps newly unscheduled Divisions optional but requires an explicit removal for existing Sessions", () => {
    expect(
      previewCompetitionSchedules([{ id: "new" }], [], formatter).drafts
    ).toEqual([]);
    const preview = previewCompetitionSchedules(
      [{ id: "junior" }],
      [existing],
      formatter
    );
    expect(preview.drafts[0]?.changed).toBe(true);
    expect(Number.isNaN(preview.drafts[0]?.startAt)).toBe(true);
  });
  it("validates swapped times against the final batch", () => {
    const one = { ...existing, cancelledAt: null };
    const two = {
      ...one,
      id: "second",
      divisionId: "senior",
      startAt: start + 3600000,
      endAt: start + 7200000,
    };
    const preview = previewCompetitionSchedules(
      [
        { ...draft, startAt: "2026-09-20T10:00", endAt: "2026-09-20T11:00" },
        { ...draft, id: "senior" },
      ],
      [one, two],
      formatter
    );
    expect(preview.drafts.every((row) => row.changed)).toBe(true);
    for (const row of preview.drafts)
      expect(
        validateKalakritiSessionSchedule(
          row,
          "2026-09-20",
          "Asia/Kolkata",
          preview.finalSchedule
        )
      ).toEqual({ valid: true });
  });
});
