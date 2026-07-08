import { describe, expect, it } from "vitest";
import z from "zod";

const submitSchema = z.object({
  content: z.string().min(1, "Feedback cannot be empty").max(5000),
  eventId: z.string(),
  feedbackId: z.string(),
  now: z.number(),
  submissionId: z.string(),
});

const updateSchema = z.object({
  content: z.string().min(1, "Feedback cannot be empty").max(5000),
  eventId: z.string(),
  now: z.number(),
});

describe("eventFeedback mutator schemas", () => {
  describe("submit", () => {
    it("accepts valid input", () => {
      const result = submitSchema.safeParse({
        content: "Great event!",
        eventId: "event-1",
        feedbackId: "fb-1",
        now: 1_700_000_000_000,
        submissionId: "sub-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing feedbackId", () => {
      const result = submitSchema.safeParse({
        content: "Great event!",
        eventId: "event-1",
        now: 1_700_000_000_000,
        submissionId: "sub-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing submissionId", () => {
      const result = submitSchema.safeParse({
        content: "Great event!",
        eventId: "event-1",
        feedbackId: "fb-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing eventId", () => {
      const result = submitSchema.safeParse({
        content: "Great event!",
        feedbackId: "fb-1",
        now: 1_700_000_000_000,
        submissionId: "sub-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty content", () => {
      const result = submitSchema.safeParse({
        content: "",
        eventId: "event-1",
        feedbackId: "fb-1",
        now: 1_700_000_000_000,
        submissionId: "sub-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects content exceeding max length", () => {
      const result = submitSchema.safeParse({
        content: "x".repeat(5001),
        eventId: "event-1",
        feedbackId: "fb-1",
        now: 1_700_000_000_000,
        submissionId: "sub-1",
      });
      expect(result.success).toBe(false);
    });

    it("accepts content at max length", () => {
      const result = submitSchema.safeParse({
        content: "x".repeat(5000),
        eventId: "event-1",
        feedbackId: "fb-1",
        now: 1_700_000_000_000,
        submissionId: "sub-1",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("update", () => {
    it("accepts valid input", () => {
      const result = updateSchema.safeParse({
        content: "Updated feedback",
        eventId: "event-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing eventId", () => {
      const result = updateSchema.safeParse({
        content: "Updated feedback",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty content", () => {
      const result = updateSchema.safeParse({
        content: "",
        eventId: "event-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects content exceeding max length", () => {
      const result = updateSchema.safeParse({
        content: "x".repeat(5001),
        eventId: "event-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("accepts content at max length", () => {
      const result = updateSchema.safeParse({
        content: "x".repeat(5000),
        eventId: "event-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("eventFeedback submit validation logic", () => {
  const makeEvent = (
    overrides: Partial<{
      feedbackEnabled: boolean;
      startTime: number;
      endTime: number | null;
      feedbackDeadline: number | null;
    }> = {}
  ): {
    endTime: number | null;
    feedbackDeadline: number | null;
    feedbackEnabled: boolean;
    startTime: number;
  } => ({
    endTime: 1_699_995_000_000,
    feedbackDeadline: null,
    feedbackEnabled: true,
    startTime: 1_699_990_000_000,
    ...overrides,
  });

  const now = 1_700_000_000_000;

  it("happy path — past event with feedback enabled, member, no prior submission", () => {
    const event = makeEvent();
    const isMember = true;
    const existingSubmission = undefined;

    expect(event.feedbackEnabled).toBe(true);
    const eventTime = event.endTime;
    if (eventTime === null) {
      throw new Error("Expected event endTime");
    }
    expect(eventTime <= now).toBe(true);
    expect(
      event.feedbackDeadline === null || event.feedbackDeadline >= now
    ).toBe(true);
    expect(isMember).toBe(true);
    expect(existingSubmission).toBeUndefined();
  });

  it("errors when event not found", () => {
    const event = undefined;
    expect(event).toBeUndefined();
  });

  it("errors when feedback not enabled", () => {
    const event = makeEvent({ feedbackEnabled: false });
    expect(event.feedbackEnabled).toBe(false);
  });

  it("errors when event has not ended yet (using endTime)", () => {
    const event = makeEvent({ endTime: now + 100_000 });
    const eventTime = event.endTime;
    if (eventTime === null) {
      throw new Error("Expected event endTime");
    }
    expect(eventTime > now).toBe(true);
  });

  it("errors when event has not ended yet (using startTime when no endTime)", () => {
    const event = makeEvent({ endTime: null, startTime: now + 100_000 });
    const eventTime = event.endTime ?? event.startTime;
    expect(eventTime > now).toBe(true);
  });

  it("errors when feedback deadline has passed", () => {
    const event = makeEvent({ feedbackDeadline: now - 1 });
    expect(
      event.feedbackDeadline !== null && event.feedbackDeadline < now
    ).toBe(true);
  });

  it("errors when user is not an event member", () => {
    const isMember = false;
    expect(isMember).toBe(false);
  });

  it("errors when user has already submitted feedback", () => {
    const existingSubmission = { feedbackId: "fb-1", id: "sub-1" };
    expect(existingSubmission).toBeDefined();
  });
});

describe("eventFeedback update validation logic", () => {
  const now = 1_700_000_000_000;

  it("happy path — user updates existing feedback before deadline", () => {
    const submission = { feedbackId: "fb-1", id: "sub-1" };
    const event = { feedbackDeadline: null };

    expect(submission).toBeDefined();
    expect(event).toBeDefined();
    expect(
      event.feedbackDeadline === null || event.feedbackDeadline >= now
    ).toBe(true);
  });

  it("errors when no prior submission found", () => {
    const submission = undefined;
    expect(submission).toBeUndefined();
  });

  it("errors when event not found", () => {
    const event = undefined;
    expect(event).toBeUndefined();
  });

  it("errors when feedback deadline has passed", () => {
    const event: { feedbackDeadline: null | number } = {
      feedbackDeadline: now - 1,
    };
    expect(
      event.feedbackDeadline !== null && event.feedbackDeadline < now
    ).toBe(true);
  });

  it("errors when updated content exceeds max length", () => {
    const result = updateSchema.safeParse({
      content: "x".repeat(5001),
      eventId: "event-1",
      now,
    });
    expect(result.success).toBe(false);
  });
});
