import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import type {
  EventFeedbackSubmission,
  TeamEvent,
  TeamEventMember,
} from "../schema";
import { zql } from "../schema";

export const eventFeedbackMutators = {
  submit: defineMutator(
    z.object({
      feedbackId: z.string(),
      submissionId: z.string(),
      eventId: z.string(),
      content: z.string().min(1, "Feedback cannot be empty").max(5000),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }
      if (!event.feedbackEnabled) {
        throw new Error("Feedback is not enabled for this event");
      }

      const eventTime = event.endTime ?? event.startTime;
      if (eventTime > args.now) {
        throw new Error("Event has not ended yet");
      }

      if (event.feedbackDeadline && event.feedbackDeadline < args.now) {
        throw new Error("Feedback deadline has passed");
      }

      const membership = (await tx.run(
        zql.teamEventMember
          .where("eventId", args.eventId)
          .where("userId", ctx.userId)
          .one()
      )) as TeamEventMember | undefined;
      if (!membership) {
        throw new Error("You are not a member of this event");
      }

      // Duplicate check on server only — eventFeedbackSubmission is not
      // synced to clients (anonymity preservation).
      if (tx.location === "server") {
        const existing = (await tx.run(
          zql.eventFeedbackSubmission
            .where("eventId", args.eventId)
            .where("userId", ctx.userId)
            .one()
        )) as EventFeedbackSubmission | undefined;
        if (existing) {
          throw new Error(
            "You have already submitted feedback for this event"
          );
        }
      }

      await tx.mutate.eventFeedback.insert({
        id: args.feedbackId,
        eventId: args.eventId,
        content: args.content,
        createdAt: args.now,
        updatedAt: args.now,
      });

      await tx.mutate.eventFeedbackSubmission.insert({
        id: args.submissionId,
        eventId: args.eventId,
        userId: ctx.userId,
        feedbackId: args.feedbackId,
        submittedAt: args.now,
      });
    }
  ),

  update: defineMutator(
    z.object({
      feedbackId: z.string(),
      eventId: z.string(),
      content: z.string().min(1, "Feedback cannot be empty").max(5000),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      // Validate ownership on server only — eventFeedbackSubmission is not
      // synced to clients (anonymity), so the client passes feedbackId directly.
      if (tx.location === "server") {
        const submission = (await tx.run(
          zql.eventFeedbackSubmission
            .where("eventId", args.eventId)
            .where("userId", ctx.userId)
            .one()
        )) as EventFeedbackSubmission | undefined;
        if (!submission) {
          throw new Error("No feedback submission found");
        }
        if (submission.feedbackId !== args.feedbackId) {
          throw new Error("Unauthorized");
        }
      }

      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }

      if (event.feedbackDeadline && event.feedbackDeadline < args.now) {
        throw new Error("Feedback deadline has passed");
      }

      await tx.mutate.eventFeedback.update({
        id: args.feedbackId,
        content: args.content,
        updatedAt: args.now,
      });
    }
  ),
};
