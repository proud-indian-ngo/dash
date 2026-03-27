import { db } from "@pi-dash/db";
import {
  eventFeedback,
  eventFeedbackSubmission,
} from "@pi-dash/db/schema/event-feedback";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import z from "zod";
import { authMiddleware } from "@/middleware/auth";

export const getMyEventFeedback = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ eventId: z.string() }))
  .handler(async ({ context, data }) => {
    const userId = context.session?.user?.id;
    if (!userId) {
      return null;
    }

    const submission = await db
      .select({
        feedbackId: eventFeedbackSubmission.feedbackId,
      })
      .from(eventFeedbackSubmission)
      .where(
        and(
          eq(eventFeedbackSubmission.eventId, data.eventId),
          eq(eventFeedbackSubmission.userId, userId)
        )
      )
      .limit(1);

    const first = submission[0];
    if (!first) {
      return null;
    }

    const feedback = await db
      .select({
        id: eventFeedback.id,
        content: eventFeedback.content,
        createdAt: eventFeedback.createdAt,
        updatedAt: eventFeedback.updatedAt,
      })
      .from(eventFeedback)
      .where(eq(eventFeedback.id, first.feedbackId))
      .limit(1);

    return feedback[0] ?? null;
  });
