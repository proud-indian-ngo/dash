import { describe, expect, it } from "bun:test";

import {
  countReviewableInterests,
  deriveCardActionState,
  eventEndLabel,
  formatDuration,
  recurrenceTag,
} from "./event-row-action";

const base = {
  canManageInterest: false,
  hasStarted: false,
  interest: undefined,
  isMember: false,
  isOwnTeam: false,
  isPublic: true,
};

describe("deriveCardActionState", () => {
  it("offers Show interest on a public event that has not started", () => {
    expect(deriveCardActionState(base)).toEqual({ kind: "showInterest" });
  });

  it("never offers Show interest once the event has started", () => {
    expect(deriveCardActionState({ ...base, hasStarted: true })).toEqual({
      kind: "none",
    });
  });

  it("shows an expired interest as not reviewed, with no cancel or re-offer", () => {
    for (const hasStarted of [true, false]) {
      expect(
        deriveCardActionState({
          ...base,
          hasStarted,
          interest: { id: "interest-1", status: "expired" },
        })
      ).toEqual({ kind: "interestNotReviewed" });
    }
  });

  it("keeps a pending interest cancellable until the event starts", () => {
    const interest = { id: "interest-1", status: "pending" as const };
    expect(deriveCardActionState({ ...base, interest })).toEqual({
      interestId: "interest-1",
      kind: "interestPending",
      started: false,
    });
    expect(
      deriveCardActionState({ ...base, hasStarted: true, interest })
    ).toEqual({
      interestId: "interest-1",
      kind: "interestPending",
      started: true,
    });
  });
});

describe("recurrenceTag", () => {
  it("names the frequency, with the interval when it is more than one", () => {
    expect(recurrenceTag(null)).toBeNull();
    expect(recurrenceTag("FREQ=WEEKLY;BYDAY=SA")).toBe("Weekly");
    expect(recurrenceTag("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU")).toBe(
      "Every 2 weeks"
    );
    expect(recurrenceTag("RRULE:FREQ=MONTHLY")).toBe("Monthly");
    expect(recurrenceTag("FREQ=WEEKLY;INTERVAL=1")).toBe("Weekly");
    expect(recurrenceTag("FREQ=HOURLY")).toBe("Recurring");
  });
});

describe("formatDuration", () => {
  it("reads in minutes and hours", () => {
    expect(formatDuration(45 * 60_000)).toBe("45 min");
    expect(formatDuration(2 * 3_600_000)).toBe("2 hr");
    expect(formatDuration(90 * 60_000)).toBe("1 hr 30 min");
  });
});

describe("eventEndLabel", () => {
  const start = new Date(2026, 9, 21, 22, 0).getTime();

  it("shows the length for events under a day, even past midnight", () => {
    expect(eventEndLabel(start, start + 3 * 3_600_000)).toBe("3 hr");
  });

  it("names the end day for multi-day events", () => {
    expect(eventEndLabel(start, start + 30 * 3_600_000)).toBe("to 23 Oct");
  });

  it("shows nothing for open-ended or inverted events", () => {
    expect(eventEndLabel(start, null)).toBeNull();
    expect(eventEndLabel(start, start)).toBeNull();
    expect(eventEndLabel(start, start - 60_000)).toBeNull();
  });
});

describe("countReviewableInterests", () => {
  const now = 1_000_000;

  it("counts pending requests per event, skipping events that started", () => {
    const counts = countReviewableInterests(
      [
        { event: { startTime: now + 1 }, eventId: "a" },
        { event: { startTime: now + 1 }, eventId: "a" },
        { event: { startTime: now + 5 }, eventId: "b" },
        { event: { startTime: now }, eventId: "started" },
        { event: undefined, eventId: "missing" },
      ],
      now
    );
    expect([...counts]).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});
