import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import type {
  EventFeedback,
  EventFeedbackSubmission,
  TeamEvent,
  TeamEventMember,
} from "../schema";
import { zql } from "../schema";

export const eventFeedbackMutators = {
  submit: defineMutator(
    z.object({
      content: z.string().min(1, "Feedback cannot be empty").max(5000),
      eventId: z.string(),
      feedbackId: z.string(),
      now: z.number(),
      submissionId: z.string(),
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
          throw new Error("You have already submitted feedback for this event");
        }
      }

      await tx.mutate.eventFeedback.insert({
        content: args.content,
        createdAt: args.now,
        eventId: args.eventId,
        id: args.feedbackId,
        updatedAt: args.now,
      });

      await tx.mutate.eventFeedbackSubmission.insert({
        eventId: args.eventId,
        feedbackId: args.feedbackId,
        id: args.submissionId,
        submittedAt: args.now,
        userId: ctx.userId,
      });
    }
  ),

  update: defineMutator(
    z.object({
      content: z.string().min(1, "Feedback cannot be empty").max(5000),
      eventId: z.string(),
      feedbackId: z.string(),
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
        const existingFeedback = (await tx.run(
          zql.eventFeedback.where("id", args.feedbackId).one()
        )) as EventFeedback | undefined;
        if (!existingFeedback || existingFeedback.eventId !== args.eventId) {
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
        content: args.content,
        id: args.feedbackId,
        updatedAt: args.now,
      });
    }
  ),
};
