import { createHash } from "node:crypto";
import {
  notifyPhotoApproved,
  notifyPhotoRejected,
  notifyPhotosApproved,
  notifyPhotosRejected,
} from "@pi-dash/notifications";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type {
  NotifyPhotoApprovedPayload,
  NotifyPhotoRejectedPayload,
} from "../enqueue";

function groupPhotoJobs<
  T extends {
    uploaderId: string;
    eventId: string;
    eventName: string;
    photoId: string;
  },
>(
  jobs: Job<T>[]
): Map<
  string,
  {
    uploaderId: string;
    eventId: string;
    eventName: string;
    photoIds: string[];
  }
> {
  const groups = new Map<
    string,
    {
      uploaderId: string;
      eventId: string;
      eventName: string;
      photoIds: string[];
    }
  >();
  for (const job of jobs) {
    const key = `${job.data.uploaderId}::${job.data.eventId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.photoIds.push(job.data.photoId);
    } else {
      groups.set(key, {
        uploaderId: job.data.uploaderId,
        eventId: job.data.eventId,
        eventName: job.data.eventName,
        photoIds: [job.data.photoId],
      });
    }
  }
  return groups;
}

// Idempotency key derived from sorted photoIds — deterministic regardless of
// how pg-boss splits the batch across poll cycles (unlike jobIds, which vary
// per delivery).
function batchIdempotencyKey(prefix: string, photoIds: string[]): string {
  const hash = createHash("sha256")
    .update([...photoIds].sort().join(","))
    .digest("hex")
    .slice(0, 12);
  return `${prefix}-${hash}`;
}

export async function handleNotifyPhotoApproved(
  jobs: Job<NotifyPhotoApprovedPayload>[]
): Promise<void> {
  const groups = groupPhotoJobs(jobs);
  const results = await Promise.allSettled(
    [...groups.values()].map(({ uploaderId, eventId, eventName, photoIds }) => {
      // photoIds[0] is always defined: groupPhotoJobs initialises with at least
      // one element, but TypeScript infers string[] not [string, ...string[]].
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
        idempotencyKey: batchIdempotencyKey("photos-approved", photoIds),
        uploaderId,
      });
    })
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-photo-approved",
    });
    for (const f of failures) {
      log.set({ event: "notification_group_failed" });
      log.error(
        f.status === "rejected" && f.reason instanceof Error
          ? f.reason
          : String((f as PromiseRejectedResult).reason)
      );
      log.emit();
    }
    throw new Error(
      `${failures.length} of ${results.length} photo approval notification groups failed`
    );
  }
}

export async function handleNotifyPhotoRejected(
  jobs: Job<NotifyPhotoRejectedPayload>[]
): Promise<void> {
  const groups = groupPhotoJobs(jobs);
  const results = await Promise.allSettled(
    [...groups.values()].map(({ uploaderId, eventId, eventName, photoIds }) => {
      // photoIds[0] is always defined: see note in handleNotifyPhotoApproved.
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
        idempotencyKey: batchIdempotencyKey("photos-rejected", photoIds),
        uploaderId,
      });
    })
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-photo-rejected",
    });
    for (const f of failures) {
      log.set({ event: "notification_group_failed" });
      log.error(
        f.status === "rejected" && f.reason instanceof Error
          ? f.reason
          : String((f as PromiseRejectedResult).reason)
      );
      log.emit();
    }
    throw new Error(
      `${failures.length} of ${results.length} photo rejection notification groups failed`
    );
  }
}
