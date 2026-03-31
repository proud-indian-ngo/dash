import { describe, expect, it } from "vitest";

// Inline copy of the groupByUploaderEvent logic for isolated testing.
// The handler keeps this as a private implementation detail.
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
    expect(groups.get("user-a::event-1")?.jobIds).toEqual(["job-1"]);
  });

  it("handles an empty job array", () => {
    const groups = groupPhotoJobs([]);
    expect(groups.size).toBe(0);
  });

  it("accumulates jobIds alongside photoIds", () => {
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
    expect(group?.jobIds).toEqual(["job-1", "job-2", "job-3"]);
    expect(group?.photoIds).toEqual(["p1", "p2", "p3"]);
  });
});
