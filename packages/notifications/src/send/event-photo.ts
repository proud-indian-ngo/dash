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
  const body = `Your photo for ${eventName} has been approved.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Photo Approved",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendMessage({
    to: uploaderId,
    title: "Photo Approved",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `photo-approved-${photoId}`,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}

export async function notifyPhotoRejected({
  photoId,
  eventId,
  eventName,
  uploaderId,
}: PhotoRejectedOptions): Promise<void> {
  const body = `Your photo for ${eventName} was rejected.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Photo Rejected",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendMessage({
    to: uploaderId,
    title: "Photo Rejected",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `photo-rejected-${photoId}`,
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
  const body = `${count} of your photos for ${eventName} have been approved.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Photos Approved",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendMessage({
    to: uploaderId,
    title: "Photos Approved",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey,
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
  const body = `${count} of your photos for ${eventName} were rejected.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Photos Rejected",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendMessage({
    to: uploaderId,
    title: "Photos Rejected",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}
