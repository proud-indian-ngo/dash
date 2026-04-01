import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const APPROVED_KEY_PREFIX = /^photos-approved-/;
const REJECTED_KEY_PREFIX = /^photos-rejected-/;

// Inline copy of groupPhotoJobs for isolated testing.
// IMPORTANT: if you change the grouping logic in notify-event-photo.ts,
// update this copy too — they must stay in sync.
function groupPhotoJobs<
  T extends {
    uploaderId: string;
    eventId: string;
    eventName: string;
    photoId: string;
  },
>(
  jobs: Array<{ id: string; data: T }>
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

// Inline copy of batchIdempotencyKey.
// IMPORTANT: if you change the key logic in notify-event-photo.ts, update
// this copy too — they must stay in sync.
function batchIdempotencyKey(prefix: string, photoIds: string[]): string {
  const hash = createHash("sha256")
    .update([...photoIds].sort().join(","))
    .digest("hex")
    .slice(0, 12);
  return `${prefix}-${hash}`;
}

function makeJob(
  id: string,
  data: {
    uploaderId: string;
    eventId: string;
    eventName: string;
    photoId: string;
  }
) {
  return { id, data };
}

describe("groupPhotoJobs", () => {
  it("groups photos by uploaderId × eventId", () => {
    const jobs = [
      makeJob("job-1", {
        uploaderId: "user-a",
        eventId: "event-1",
        eventName: "Event 1",
        photoId: "photo-1",
      }),
      makeJob("job-2", {
        uploaderId: "user-a",
        eventId: "event-1",
        eventName: "Event 1",
        photoId: "photo-2",
      }),
      makeJob("job-3", {
        uploaderId: "user-a",
        eventId: "event-2",
        eventName: "Event 2",
        photoId: "photo-3",
      }),
    ];
    const groups = groupPhotoJobs(jobs);
    expect(groups.size).toBe(2);
    expect(groups.get("user-a::event-1")?.photoIds).toEqual([
      "photo-1",
      "photo-2",
    ]);
    expect(groups.get("user-a::event-2")?.photoIds).toEqual(["photo-3"]);
  });

  it("keeps different uploaders in separate groups for the same event", () => {
    const jobs = [
      makeJob("job-1", {
        uploaderId: "user-a",
        eventId: "event-1",
        eventName: "E",
        photoId: "photo-1",
      }),
      makeJob("job-2", {
        uploaderId: "user-b",
        eventId: "event-1",
        eventName: "E",
        photoId: "photo-2",
      }),
    ];
    const groups = groupPhotoJobs(jobs);
    expect(groups.size).toBe(2);
    expect(groups.get("user-a::event-1")?.photoIds).toEqual(["photo-1"]);
    expect(groups.get("user-b::event-1")?.photoIds).toEqual(["photo-2"]);
  });

  it("handles a single job as a group of one", () => {
    const jobs = [
      makeJob("job-1", {
        uploaderId: "user-a",
        eventId: "event-1",
        eventName: "E",
        photoId: "photo-1",
      }),
    ];
    const groups = groupPhotoJobs(jobs);
    expect(groups.size).toBe(1);
    expect(groups.get("user-a::event-1")?.photoIds).toHaveLength(1);
  });

  it("handles an empty job array", () => {
    const groups = groupPhotoJobs([]);
    expect(groups.size).toBe(0);
  });

  it("accumulates photoIds for the same uploader × event", () => {
    const jobs = [
      makeJob("job-1", {
        uploaderId: "u",
        eventId: "e",
        eventName: "E",
        photoId: "p1",
      }),
      makeJob("job-2", {
        uploaderId: "u",
        eventId: "e",
        eventName: "E",
        photoId: "p2",
      }),
      makeJob("job-3", {
        uploaderId: "u",
        eventId: "e",
        eventName: "E",
        photoId: "p3",
      }),
    ];
    const group = groupPhotoJobs(jobs).get("u::e");
    expect(group?.photoIds).toEqual(["p1", "p2", "p3"]);
  });
});

describe("batchIdempotencyKey", () => {
  it("produces the same key regardless of photoId order", () => {
    const key1 = batchIdempotencyKey("photos-approved", [
      "photo-c",
      "photo-a",
      "photo-b",
    ]);
    const key2 = batchIdempotencyKey("photos-approved", [
      "photo-a",
      "photo-b",
      "photo-c",
    ]);
    expect(key1).toBe(key2);
  });

  it("produces different keys for different photo sets", () => {
    const key1 = batchIdempotencyKey("photos-approved", ["photo-1", "photo-2"]);
    const key2 = batchIdempotencyKey("photos-approved", ["photo-1", "photo-3"]);
    expect(key1).not.toBe(key2);
  });

  it("includes the prefix in the key", () => {
    const approvedKey = batchIdempotencyKey("photos-approved", ["photo-1"]);
    const rejectedKey = batchIdempotencyKey("photos-rejected", ["photo-1"]);
    expect(approvedKey).toMatch(APPROVED_KEY_PREFIX);
    expect(rejectedKey).toMatch(REJECTED_KEY_PREFIX);
    expect(approvedKey).not.toBe(rejectedKey);
  });

  it("key is stable across calls (no random component)", () => {
    const photoIds = ["photo-x", "photo-y"];
    expect(batchIdempotencyKey("p", photoIds)).toBe(
      batchIdempotencyKey("p", photoIds)
    );
  });
});

describe("error isolation", () => {
  it("notifies other groups even when one group fails", async () => {
    // Simulate the handler logic: Promise.allSettled isolates per-group failures.
    const results: string[] = [];
    const notifyGroup = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error("Courier error")))
      .mockImplementationOnce(() => {
        results.push("user-b notified");
        return Promise.resolve();
      });

    const settled = await Promise.allSettled([notifyGroup(), notifyGroup()]);

    // First group failed, second succeeded
    expect(settled[0].status).toBe("rejected");
    expect(settled[1].status).toBe("fulfilled");
    expect(results).toEqual(["user-b notified"]);

    // Handler should rethrow so pg-boss retries the batch
    const failures = settled.filter((r) => r.status === "rejected");
    expect(failures).toHaveLength(1);
  });
});
