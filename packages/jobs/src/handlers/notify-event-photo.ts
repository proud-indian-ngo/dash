import type { Job } from "pg-boss";
import type {
  NotifyPhotoApprovedPayload,
  NotifyPhotoRejectedPayload,
} from "../enqueue";

type PhotoJob<T> = Job<T>;

function groupPhotoJobs<
  T extends {
    uploaderId: string;
    eventId: string;
    eventName: string;
    photoId: string;
  },
>(
  jobs: PhotoJob<T>[]
): Map<
  string,
  {
    uploaderId: string;
    eventId: string;
    eventName: string;
    photoIds: string[];
    jobIds: string[];
  }
> {
  const groups = new Map<
    string,
    {
      uploaderId: string;
      eventId: string;
      eventName: string;
      photoIds: string[];
      jobIds: string[];
    }
  >();
  for (const job of jobs) {
    const key = `${job.data.uploaderId}::${job.data.eventId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.photoIds.push(job.data.photoId);
      existing.jobIds.push(job.id);
    } else {
      groups.set(key, {
        uploaderId: job.data.uploaderId,
        eventId: job.data.eventId,
        eventName: job.data.eventName,
        photoIds: [job.data.photoId],
        jobIds: [job.id],
      });
    }
  }
  return groups;
}

function batchIdempotencyKey(prefix: string, jobIds: string[]): string {
  return `${prefix}-${[...jobIds].sort().join("").slice(0, 20)}`;
}

export async function handleNotifyPhotoApproved(
  jobs: PhotoJob<NotifyPhotoApprovedPayload>[]
): Promise<void> {
  const { notifyPhotoApproved, notifyPhotosApproved } = await import(
    "@pi-dash/notifications"
  );
  const groups = groupPhotoJobs(jobs);
  await Promise.all(
    [...groups.values()].map(
      ({ uploaderId, eventId, eventName, photoIds, jobIds }) => {
        if (photoIds.length === 1 && photoIds[0]) {
          return notifyPhotoApproved({
            photoId: photoIds[0],
            eventId,
            eventName,
            uploaderId,
          });
        }
        return notifyPhotosApproved({
          count: photoIds.length,
          eventId,
          eventName,
          idempotencyKey: batchIdempotencyKey("photos-approved", jobIds),
          uploaderId,
        });
      }
    )
  );
}

export async function handleNotifyPhotoRejected(
  jobs: PhotoJob<NotifyPhotoRejectedPayload>[]
): Promise<void> {
  const { notifyPhotoRejected, notifyPhotosRejected } = await import(
    "@pi-dash/notifications"
  );
  const groups = groupPhotoJobs(jobs);
  await Promise.all(
    [...groups.values()].map(
      ({ uploaderId, eventId, eventName, photoIds, jobIds }) => {
        if (photoIds.length === 1 && photoIds[0]) {
          return notifyPhotoRejected({
            photoId: photoIds[0],
            eventId,
            eventName,
            uploaderId,
          });
        }
        return notifyPhotosRejected({
          count: photoIds.length,
          eventId,
          eventName,
          idempotencyKey: batchIdempotencyKey("photos-rejected", jobIds),
          uploaderId,
        });
      }
    )
  );
}
