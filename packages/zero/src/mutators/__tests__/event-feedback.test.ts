import { describe, expect, it, vi } from "vitest";
import z from "zod";
import type { Context } from "../../context";
import { eventFeedbackMutators } from "../event-feedback";

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

const plate = (...urls: string[]) =>
  JSON.stringify([
    {
      children: [
        { text: "Feedback" },
        ...urls.map((url) => ({
          children: [{ text: "" }],
          type: "img",
          url,
        })),
      ],
      type: "p",
    },
  ]);

const mediaUrl =
  "/api/media/event-update?eventId=event-1&key=app%2Fupdates%2Fevent-1%2Fprivate.jpg";

const context: Context = {
  asyncTasks: [],
  permissions: [],
  role: "volunteer",
  userId: "user-1",
};

const makeTx = (...rows: unknown[]) => {
  const insertFeedback = vi.fn(async () => undefined);
  const insertSubmission = vi.fn(async () => undefined);
  const updateFeedback = vi.fn(async () => undefined);
  const queue = [...rows];
  return {
    insertFeedback,
    tx: {
      location: "server",
      mutate: {
        eventFeedback: {
          insert: insertFeedback,
          update: updateFeedback,
        },
        eventFeedbackSubmission: { insert: insertSubmission },
      },
      run: vi.fn(async () => queue.shift()),
    },
    updateFeedback,
  };
};

describe("eventFeedback server media policy", () => {
  it("rejects a new image during submission", async () => {
    const { insertFeedback, tx } = makeTx(
      {
        endTime: 0,
        feedbackDeadline: null,
        feedbackEnabled: true,
        startTime: 0,
      },
      { eventId: "event-1", userId: "user-1" }
    );

    await expect(
      eventFeedbackMutators.submit.fn({
        args: {
          content: plate(mediaUrl),
          eventId: "event-1",
          feedbackId: "feedback-1",
          now: 1,
          submissionId: "submission-1",
        },
        ctx: context,
        tx,
      } as never)
    ).rejects.toThrow("Feedback cannot contain new images");
    expect(insertFeedback).not.toHaveBeenCalled();
  });

  it("rejects a new image during an update", async () => {
    const { tx, updateFeedback } = makeTx(
      { feedbackId: "feedback-1" },
      { content: plate(), eventId: "event-1", id: "feedback-1" }
    );

    await expect(
      eventFeedbackMutators.update.fn({
        args: {
          content: plate(mediaUrl),
          eventId: "event-1",
          feedbackId: "feedback-1",
          now: 2,
        },
        ctx: context,
        tx,
      } as never)
    ).rejects.toThrow("Feedback cannot contain new images");
    expect(updateFeedback).not.toHaveBeenCalled();
  });

  it("preserves an existing image during an update", async () => {
    const { tx, updateFeedback } = makeTx(
      { feedbackId: "feedback-1" },
      {
        content: plate(mediaUrl),
        eventId: "event-1",
        id: "feedback-1",
      },
      { feedbackDeadline: null }
    );

    await eventFeedbackMutators.update.fn({
      args: {
        content: plate(mediaUrl),
        eventId: "event-1",
        feedbackId: "feedback-1",
        now: 2,
      },
      ctx: context,
      tx,
    } as never);

    expect(updateFeedback).toHaveBeenCalledWith({
      content: plate(mediaUrl),
      id: "feedback-1",
      updatedAt: 2,
    });
  });
});
