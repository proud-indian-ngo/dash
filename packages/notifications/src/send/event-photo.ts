import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { eventLabel } from "@pi-dash/shared/event-label";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

import { sendMessage } from "../send-message";
import { TOPICS } from "../topics";

interface PhotoApprovedOptions {
  eventId: string;
  eventName: string;
  photoId: string;
  uploaderId: string;
  startTime: number;
}

interface PhotoRejectedOptions {
  eventId: string;
  eventName: string;
  photoId: string;
  uploaderId: string;
  startTime: number;
}

export async function notifyPhotoApproved({
  photoId,
  eventId,
  eventName,
  startTime,
  uploaderId,
}: PhotoApprovedOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const body = `Your photo for ${label} looks great — it's been approved!`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Photo approved!",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: "Your photo was approved",
      name: label,
      status: { label: "Approved", tone: "success" },
    },
    emailHtml,
    idempotencyKey: `photo-approved-${photoId}`,
    title: "✅ Photo approved!",
    to: uploaderId,
    topic: TOPICS.EVENTS_PHOTOS,
    whatsappTemplate: whatsappTemplate(
      "photos_approved",
      { count: "1", event: label },
      `/events/${eventId}`
    ),
  });
}

export async function notifyPhotoRejected({
  photoId,
  eventId,
  eventName,
  startTime,
  uploaderId,
}: PhotoRejectedOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const body = `Your photo for ${label} wasn't published.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Photo not published",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: "Your photo wasn't published",
      name: label,
      status: { label: "Not published", tone: "neutral" },
    },
    emailHtml,
    idempotencyKey: `photo-rejected-${photoId}`,
    title: "📷 Photo not published",
    to: uploaderId,
    topic: TOPICS.EVENTS_PHOTOS,
    whatsappTemplate: whatsappTemplate(
      "photos_not_published",
      { count: "1", event: label },
      `/events/${eventId}`
    ),
  });
}

interface PhotosBatchOptions {
  count: number;
  eventId: string;
  eventName: string;
  idempotencyKey: string;
  uploaderId: string;
  startTime: number;
}

export async function notifyPhotosApproved({
  count,
  eventId,
  eventName,
  startTime,
  idempotencyKey,
  uploaderId,
}: PhotosBatchOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const body = `${count} of your photos for ${label} made the cut — nice shots!`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Photos approved!",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: `${count} photos approved`,
      name: label,
      status: { label: "Approved", tone: "success" },
    },
    emailHtml,
    idempotencyKey,
    title: "✅ Photos approved!",
    to: uploaderId,
    topic: TOPICS.EVENTS_PHOTOS,
    whatsappTemplate: whatsappTemplate(
      "photos_approved",
      { count: String(count), event: label },
      `/events/${eventId}`
    ),
  });
}

export async function notifyPhotosRejected({
  count,
  eventId,
  eventName,
  startTime,
  idempotencyKey,
  uploaderId,
}: PhotosBatchOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const body = `${count} of your photos for ${label} weren't published.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Photos not published",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: `${count} photos not published`,
      name: label,
      status: { label: "Not published", tone: "neutral" },
    },
    emailHtml,
    idempotencyKey,
    title: "📷 Photos not published",
    to: uploaderId,
    topic: TOPICS.EVENTS_PHOTOS,
    whatsappTemplate: whatsappTemplate(
      "photos_not_published",
      { count: String(count), event: label },
      `/events/${eventId}`
    ),
  });
}
