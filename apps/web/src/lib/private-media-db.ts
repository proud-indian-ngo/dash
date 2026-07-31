import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  eventFeedback,
  eventFeedbackSubmission,
} from "@pi-dash/db/schema/event-feedback";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { vendorPayment } from "@pi-dash/db/schema/vendor";
import { env } from "@pi-dash/env/server";
import { eq } from "drizzle-orm";
import { defaultR2ObjectAccessDeps } from "./authorized-r2-object";
import type { PrivateMediaAccessDeps } from "./private-media-access";

export const defaultPrivateMediaAccessDeps: PrivateMediaAccessDeps = {
  ...defaultR2ObjectAccessDeps,
  findEvent: async (eventId) => {
    const event = await db.query.teamEvent.findFirst({
      columns: { isPublic: true, teamId: true },
      where: eq(teamEvent.id, eventId),
    });
    return event ?? null;
  },
  findUserImage: async (userId) => {
    const row = await db.query.user.findFirst({
      columns: { image: true },
      where: eq(user.id, userId),
    });
    return row?.image ?? null;
  },
  findVendorPaymentOwner: async (vendorPaymentId) => {
    const row = await db.query.vendorPayment.findFirst({
      columns: { userId: true },
      where: eq(vendorPayment.id, vendorPaymentId),
    });
    return row?.userId ?? null;
  },
  getEventMediaRecords: async (eventId) => {
    const [updates, feedback, feedbackSubmissions] = await Promise.all([
      db
        .select({
          content: eventUpdate.content,
          createdBy: eventUpdate.createdBy,
          status: eventUpdate.status,
        })
        .from(eventUpdate)
        .where(eq(eventUpdate.eventId, eventId)),
      db
        .select({ content: eventFeedback.content, id: eventFeedback.id })
        .from(eventFeedback)
        .where(eq(eventFeedback.eventId, eventId)),
      db
        .select({
          feedbackId: eventFeedbackSubmission.feedbackId,
          userId: eventFeedbackSubmission.userId,
        })
        .from(eventFeedbackSubmission)
        .where(eq(eventFeedbackSubmission.eventId, eventId)),
    ]);
    const submittersByFeedbackId = new Map<string, string[]>();
    for (const submission of feedbackSubmissions) {
      const submitters =
        submittersByFeedbackId.get(submission.feedbackId) ?? [];
      submitters.push(submission.userId);
      submittersByFeedbackId.set(submission.feedbackId, submitters);
    }
    return [
      ...updates.map((row) => ({
        content: row.content,
        createdBy: row.createdBy,
        kind: "eventUpdate" as const,
        status: row.status,
      })),
      ...feedback.map((row) => ({
        content: row.content,
        kind: "eventFeedback" as const,
        submitterIds: submittersByFeedbackId.get(row.id) ?? [],
      })),
    ];
  },
  keyPrefix: env.R2_KEY_PREFIX,
  legacyCdnUrl: env.VITE_CDN_URL,
};
