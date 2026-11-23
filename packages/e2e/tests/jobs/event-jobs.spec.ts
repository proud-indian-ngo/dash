import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { eventLabel } from "@pi-dash/shared/event-label";
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
    const startTime = Date.now();
    const eventA = {
      eventId: uuidv7(),
      eventName: `Photo jobs A ${tag}`,
      startTime,
    };
    const eventB = {
      eventId: uuidv7(),
      eventName: `Photo jobs B ${tag}`,
      startTime,
    };
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
        body: `2 of your photos for ${eventLabel(eventA.eventName, startTime)} made the cut — nice shots!`,
        clickAction: `/events/${eventA.eventId}`,
      },
      {
        body: `Your photo for ${eventLabel(eventB.eventName, startTime)} looks great — it's been approved!`,
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

  test("new volunteers get their first event's details and instructions the day before", async ({
    adminEmail,
    page,
    unorientedVolunteerEmail,
    volunteerEmail,
  }) => {
    const { leadContact, newId, orientedId } = await fixture<{
      leadContact: string;
      newId: string;
      orientedId: string;
    }>(
      "first-event-setup",
      adminEmail,
      unorientedVolunteerEmail,
      volunteerEmail
    );
    try {
      const inbox = (id: string) =>
        fixture<InboxRow[]>("first-event-inbox", id);
      const runs = async () =>
        (
          await fixture<{ total: number }>(
            "jobs-completed",
            "send-first-event-reminders"
          )
        ).total;
      const before = await runs();
      await enqueueJob(page, "send-first-event-reminders", {});
      await expect.poll(runs, { timeout: 30_000 }).toBeGreaterThan(before);

      const sent = await inbox(newId);
      // The one-off event with its own instructions, then the series session
      // with its series'. Not the event two days out or the pending one.
      expect(sent).toEqual([
        {
          body: expect.stringMatching(
            /first Proud Indian session tomorrow: "First event E2E one-off"[\s\S]*Where: Cubbon Park[\s\S]*Bring a notebook and arrive early\.$/
          ),
          clickAction: "/events/019f0000-0071-7000-8000-000000007102",
          title: "👋 See you tomorrow",
        },
        {
          body: expect.stringMatching(
            /"First event E2E series"[\s\S]*Where: See the event page[\s\S]*Wear comfortable clothes\.$/
          ),
          clickAction: "/events/019f0000-0071-7000-8000-000000007106",
          title: "👋 See you tomorrow",
        },
      ]);
      // Each names the team's lead to contact.
      for (const row of sent) {
        expect(row.body).toContain(`Lead contact: ${leadContact}`);
      }
      // An oriented volunteer on the same event gets nothing.
      expect(await inbox(orientedId)).toEqual([]);

      await test.step("a second run inside the window sends nothing new", async () => {
        const done = await runs();
        await enqueueJob(page, "send-first-event-reminders", {});
        await expect.poll(runs, { timeout: 30_000 }).toBeGreaterThan(done);
        expect(await inbox(newId)).toEqual(sent);
      });
    } finally {
      await fixture("first-event-cleanup");
    }
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
