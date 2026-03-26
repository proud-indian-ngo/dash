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
  await sendMessage({
    to: uploaderId,
    title: "Photo Approved",
    body: `Your photo for ${eventName} has been approved.`,
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
  await sendMessage({
    to: uploaderId,
    title: "Photo Rejected",
    body: `Your photo for ${eventName} was rejected.`,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `photo-rejected-${photoId}`,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}
