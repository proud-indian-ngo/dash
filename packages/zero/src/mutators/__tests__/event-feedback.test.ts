import { describe, expect, it, mock } from "bun:test";

import type { Context } from "../../context";
import { eventFeedbackMutators } from "../event-feedback";

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
  const insertFeedback = mock(async () => undefined);
  const insertSubmission = mock(async () => undefined);
  const updateFeedback = mock(async () => undefined);
  const queue = [...rows];
  return {
    insertFeedback,
    tx: {
      dbTransaction: {
        wrappedTransaction: { execute: mock(async () => undefined) },
      },
      location: "server",
      mutate: {
        eventFeedback: {
          insert: insertFeedback,
          update: updateFeedback,
        },
        eventFeedbackSubmission: { insert: insertSubmission },
      },
      run: mock(async () => queue.shift()),
    },
    updateFeedback,
  };
};

describe("eventFeedback server media policy", () => {
  it.each([
    [{ type: "p", children: [{ text: { bad: "shape" } }] }],
    [{ type: "p", children: { text: "Feedback" } }],
    [
      {
        type: "p",
        children: [
          {
            type: "mention",
            value: { bad: "shape" },
            children: [{ text: "" }],
          },
        ],
      },
    ],
  ])(
    "rejects malformed nodes before either submission insert or update",
    async (node) => {
      const content = JSON.stringify([node]);
      const submission = makeTx(
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
            content,
            eventId: "event-1",
            feedbackId: "feedback-1",
            now: 1,
            submissionId: "submission-1",
          },
          ctx: context,
          tx: submission.tx,
        } as never)
      ).rejects.toThrow("Invalid feedback content");
      expect(submission.insertFeedback).not.toHaveBeenCalled();
      expect(
        submission.tx.mutate.eventFeedbackSubmission.insert
      ).not.toHaveBeenCalled();

      const update = makeTx(
        { feedbackId: "feedback-1" },
        { content: plate(), eventId: "event-1", id: "feedback-1" }
      );
      await expect(
        eventFeedbackMutators.update.fn({
          args: {
            content,
            eventId: "event-1",
            feedbackId: "feedback-1",
            now: 2,
          },
          ctx: context,
          tx: update.tx,
        } as never)
      ).rejects.toThrow("Invalid feedback content");
      expect(update.updateFeedback).not.toHaveBeenCalled();
    }
  );

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
      updatedAt: expect.any(Number),
    });
  });
});
