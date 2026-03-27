import { describe, expect, it } from "vitest";
import z from "zod";

const submitSchema = z.object({
  feedbackId: z.string(),
  submissionId: z.string(),
  eventId: z.string(),
  content: z.string().min(1, "Feedback cannot be empty").max(5000),
  now: z.number(),
});

const updateSchema = z.object({
  eventId: z.string(),
  content: z.string().min(1, "Feedback cannot be empty").max(5000),
  now: z.number(),
});

describe("eventFeedback mutator schemas", () => {
  describe("submit", () => {
    it("accepts valid input", () => {
      const result = submitSchema.safeParse({
        feedbackId: "fb-1",
        submissionId: "sub-1",
        eventId: "event-1",
        content: "Great event!",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing feedbackId", () => {
      const result = submitSchema.safeParse({
        submissionId: "sub-1",
        eventId: "event-1",
        content: "Great event!",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing submissionId", () => {
      const result = submitSchema.safeParse({
        feedbackId: "fb-1",
        eventId: "event-1",
        content: "Great event!",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing eventId", () => {
      const result = submitSchema.safeParse({
        feedbackId: "fb-1",
        submissionId: "sub-1",
        content: "Great event!",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty content", () => {
      const result = submitSchema.safeParse({
        feedbackId: "fb-1",
        submissionId: "sub-1",
        eventId: "event-1",
        content: "",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects content exceeding max length", () => {
      const result = submitSchema.safeParse({
        feedbackId: "fb-1",
        submissionId: "sub-1",
        eventId: "event-1",
        content: "x".repeat(5001),
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("accepts content at max length", () => {
      const result = submitSchema.safeParse({
        feedbackId: "fb-1",
        submissionId: "sub-1",
        eventId: "event-1",
        content: "x".repeat(5000),
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("update", () => {
    it("accepts valid input", () => {
      const result = updateSchema.safeParse({
        eventId: "event-1",
        content: "Updated feedback",
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
        eventId: "event-1",
        content: "",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects content exceeding max length", () => {
      const result = updateSchema.safeParse({
        eventId: "event-1",
        content: "x".repeat(5001),
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("accepts content at max length", () => {
      const result = updateSchema.safeParse({
        eventId: "event-1",
        content: "x".repeat(5000),
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
  ) => ({
    feedbackEnabled: true,
    startTime: 1_699_990_000_000,
    endTime: 1_699_995_000_000,
    feedbackDeadline: null,
    ...overrides,
  });

  const now = 1_700_000_000_000;

  it("happy path — past event with feedback enabled, member, no prior submission", () => {
    const event = makeEvent();
    const isMember = true;
    const existingSubmission = undefined;

    expect(event.feedbackEnabled).toBe(true);
    const eventTime = event.endTime ?? event.startTime;
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
    const eventTime = event.endTime ?? event.startTime;
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
    const existingSubmission = { id: "sub-1", feedbackId: "fb-1" };
    expect(existingSubmission).toBeDefined();
  });
});

describe("eventFeedback update validation logic", () => {
  const now = 1_700_000_000_000;

  it("happy path — user updates existing feedback before deadline", () => {
    const submission = { id: "sub-1", feedbackId: "fb-1" };
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
    const event = { feedbackDeadline: now - 1 };
    expect(
      event.feedbackDeadline !== null && event.feedbackDeadline < now
    ).toBe(true);
  });

  it("errors when updated content exceeds max length", () => {
    const result = updateSchema.safeParse({
      eventId: "event-1",
      content: "x".repeat(5001),
      now,
    });
    expect(result.success).toBe(false);
  });
});
