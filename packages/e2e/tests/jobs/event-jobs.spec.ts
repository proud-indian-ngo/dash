import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/event-jobs.ts"
);

async function fixture<T>(...args: string[]) {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, ...args], {
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as T;
}

/** Queues a job through the admin jobs API, as the Jobs page would. */
async function enqueueJob(
  page: Page,
  queue: string,
  data: object,
  startAfter?: Date
) {
  const response = await page.request.post("/api/jobs", {
    data: {
      data,
      options: startAfter ? { startAfter: startAfter.toISOString() } : {},
      queue,
    },
  });
  expect(response.status()).toBe(201);
}

interface InboxRow {
  body: string;
  clickAction: string;
  title: string;
}

test.describe("Event jobs (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("photo approvals notify once per uploader and event, even when redelivered", async ({
    page,
    volunteerEmail,
  }) => {
    test.slow();
    const { id: uploaderId } = await fixture<{ id: string }>(
      "user-id",
      volunteerEmail
    );
    const tag = Date.now();
    const eventA = { eventId: uuidv7(), eventName: `Photo jobs A ${tag}` };
    const eventB = { eventId: uuidv7(), eventName: `Photo jobs B ${tag}` };
    const [first, second, third] = [uuidv7(), uuidv7(), uuidv7()];
    const approve = (event: typeof eventA, photoId: string) => ({
      ...event,
      photoId,
      uploaderId,
    });
    const jobsDone = async () =>
      (
        await fixture<{ total: number }>(
          "photo-jobs-done",
          [first, second, third].join(",")
        )
      ).total;
    const inbox = () =>
      fixture<InboxRow[]>(
        "photo-notifications",
        uploaderId,
        `${eventA.eventId},${eventB.eventId}`
      );
    const expected = [
      {
        body: `2 of your photos for ${eventA.eventName} made the cut — nice shots!`,
        clickAction: `/events/${eventA.eventId}`,
      },
      {
        body: `Your photo for ${eventB.eventName} looks great — it's been approved!`,
        clickAction: `/events/${eventB.eventId}`,
      },
    ];

    // A shared start time lands the jobs in one worker batch, as the
    // approval delay does for photos approved together.
    const batch = new Date(Date.now() + 5000);
    await enqueueJob(
      page,
      "notify-photo-approved",
      approve(eventA, first),
      batch
    );
    await enqueueJob(
      page,
      "notify-photo-approved",
      approve(eventA, second),
      batch
    );
    await enqueueJob(
      page,
      "notify-photo-approved",
      approve(eventB, third),
      batch
    );
    await expect.poll(jobsDone, { timeout: 30_000 }).toBe(3);
    const notified = await inbox();
    expect(
      notified.map(({ body, clickAction }) => ({ body, clickAction }))
    ).toEqual(expect.arrayContaining(expected));
    expect(notified).toHaveLength(2);

    await test.step("a redelivered batch in another order sends nothing new", async () => {
      const again = new Date(Date.now() + 5000);
      await enqueueJob(
        page,
        "notify-photo-approved",
        approve(eventA, second),
        again
      );
      await enqueueJob(
        page,
        "notify-photo-approved",
        approve(eventA, first),
        again
      );
      await expect.poll(jobsDone, { timeout: 30_000 }).toBe(5);
      expect(await inbox()).toEqual(notified);
    });
  });

  test("interest still pending when its event starts expires; the rest stays", async ({
    adminEmail,
    page,
    volunteerEmail,
  }) => {
    await fixture("interest-setup", adminEmail, volunteerEmail);
    try {
      await enqueueJob(page, "expire-event-interests", {});
      await expect
        .poll(
          async () =>
            (
              await fixture<{ pendingOnStarted: { status: string } }>(
                "interest-inspect"
              )
            ).pendingOnStarted.status,
          { timeout: 30_000 }
        )
        .toBe("expired");
      expect(await fixture("interest-inspect")).toEqual({
        // Closed by the job, so no one reviewed it.
        approvedOnStarted: {
          reviewed: true,
          reviewedBy: expect.any(String),
          status: "approved",
        },
        pendingOnStarted: {
          reviewed: true,
          reviewedBy: null,
          status: "expired",
        },
        pendingOnUpcoming: {
          reviewed: false,
          reviewedBy: null,
          status: "pending",
        },
      });
    } finally {
      await fixture("interest-cleanup");
    }
  });
});
