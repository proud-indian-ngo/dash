import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendMessage } from "../send-message";
import { TOPICS } from "../topics";

interface PhotoApprovedOptions {
  eventId: string;
  eventName: string;
  photoId: string;
  uploaderId: string;
}

interface PhotoRejectedOptions {
  eventId: string;
  eventName: string;
  photoId: string;
  uploaderId: string;
}

export async function notifyPhotoApproved({
  photoId,
  eventId,
  eventName,
  uploaderId,
}: PhotoApprovedOptions): Promise<void> {
  const body = `Your photo for ${eventName} looks great — it's been approved!`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Photo approved!",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    emailHtml,
    idempotencyKey: `photo-approved-${photoId}`,
    title: "✅ Photo approved!",
    to: uploaderId,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}

export async function notifyPhotoRejected({
  photoId,
  eventId,
  eventName,
  uploaderId,
}: PhotoRejectedOptions): Promise<void> {
  const body = `Your photo for ${eventName} wasn't published.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Photo not published",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    emailHtml,
    idempotencyKey: `photo-rejected-${photoId}`,
    title: "📷 Photo not published",
    to: uploaderId,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}

interface PhotosBatchOptions {
  count: number;
  eventId: string;
  eventName: string;
  idempotencyKey: string;
  uploaderId: string;
}

export async function notifyPhotosApproved({
  count,
  eventId,
  eventName,
  idempotencyKey,
  uploaderId,
}: PhotosBatchOptions): Promise<void> {
  const body = `${count} of your photos for ${eventName} made the cut — nice shots!`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Photos approved!",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    emailHtml,
    idempotencyKey,
    title: "✅ Photos approved!",
    to: uploaderId,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}

export async function notifyPhotosRejected({
  count,
  eventId,
  eventName,
  idempotencyKey,
  uploaderId,
}: PhotosBatchOptions): Promise<void> {
  const body = `${count} of your photos for ${eventName} weren't published.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Photos not published",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    emailHtml,
    idempotencyKey,
    title: "📷 Photos not published",
    to: uploaderId,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}
