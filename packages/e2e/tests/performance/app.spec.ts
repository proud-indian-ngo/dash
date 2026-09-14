import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import {
  profileZeroQueries,
  type InspectorWindow,
} from "../../helpers/zero-performance";
import { ListPage } from "../../pages/list-page";

const execFileAsync = promisify(execFile);

test("profile Dashboard, Events and financial queries at scale", async ({
  page,
  browser,
}, info) => {
  test.skip(
    process.env.APP_PERFORMANCE !== "true" ||
      info.project.name !== "super_admin",
    "Opt-in benchmark on the isolated test stack only"
  );
  test.setTimeout(300_000);
  const seed = () =>
    execFileAsync(
      "bun",
      [
        "run",
        path.resolve(
          import.meta.dirname,
          "../../helpers/seed-app-performance.ts"
        ),
      ],
      { env: process.env, timeout: 60_000 }
    );
  const fixture = JSON.parse((await seed()).stdout.trim()) as {
    counts: Record<string, number>;
    restrictedCounts: Record<string, number>;
    notificationIds: { admin: string[]; volunteer: string[] };
    visibleUsers: number;
    preferenceTopics: number;
    sampleUserId: string;
    accountIds: { admin: string; volunteer: string };
    sampleIds: {
      publicEvent: string;
      ownReimbursement: string;
      deniedReimbursement: string;
      ownVendorPayment: string;
      deniedVendorPayment: string;
    };
  };
  expect(JSON.parse((await seed()).stdout.trim())).toEqual(fixture);
  const profilePreferences = async (target: Page, userId: string) => {
    await target
      .locator("[data-sidebar='sidebar']")
      .locator("[data-sidebar='menu-button']")
      .last()
      .click();
    await target.getByRole("menuitem", { name: "Settings" }).click();
    const dialog = target.getByRole("dialog");
    await dialog.getByRole("button", { name: "Notifications" }).click();
    const queries = await profileZeroQueries(
      target,
      { "notificationPreference.byCurrentUser": fixture.preferenceTopics },
      undefined,
      {
        "notificationPreference.byCurrentUser": {
          table: "notification_topic_preference",
          count: fixture.preferenceTopics,
          userId,
        },
      }
    );
    await target.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    return queries;
  };
  const financial = {
    "reimbursement.all": fixture.counts.reimbursements!,
    "advancePayment.all": fixture.counts.advances!,
    "vendorPayment.all": fixture.counts.vendorPayments!,
  };
  const routes: [string, Record<string, number>][] = [
    [
      "/",
      {
        ...financial,
        "teamEvent.allAccessible": fixture.counts.events!,
        "teamEvent.byCurrentUserAll": fixture.counts.events!,
        "team.byCurrentUser": fixture.counts.teams!,
        "eventInterest.byCurrentUser": fixture.counts.interests!,
        "eventInterest.allPending": fixture.counts.interests!,
        "eventUpdate.allPending": fixture.counts.updates! / 2,
        "eventPhoto.allPending": fixture.counts.photos! / 2,
      },
    ],
    ["/events", { "teamEvent.allAccessible": fixture.counts.events! }],
    [
      "/reimbursements",
      {
        "reimbursement.all": fixture.counts.reimbursements!,
        "advancePayment.all": fixture.counts.advances!,
      },
    ],
    [
      "/vendor-payments",
      { "vendorPayment.all": fixture.counts.vendorPayments! },
    ],
    ["/vendors", { "vendor.all": fixture.counts.vendors! }],
  ];
  const results = [];
  for (const [route, queries] of routes) {
    const start = performance.now();
    await page.goto(route);
    const analyses = await profileZeroQueries(
      page,
      queries,
      undefined,
      route === "/"
        ? {
            "eventInterest.byCurrentUser": {
              table: "event_interest",
              count: fixture.counts.interests!,
            },
          }
        : undefined
    );
    results.push({
      route,
      navigationAndAnalysisMs: performance.now() - start,
      queries: analyses,
    });
    if (route === "/") {
      results.push({
        route: "notifications",
        queries: await profileZeroQueries(
          page,
          { "notification.forCurrentUser": 50 },
          undefined,
          {
            "notification.forCurrentUser": {
              table: "notification",
              count: 50,
              ids: fixture.notificationIds.admin,
            },
          }
        ),
      });
    }
  }
  await page.goto("/users");
  results.push({
    route: "users",
    queries: await profileZeroQueries(
      page,
      { "user.all": fixture.visibleUsers },
      undefined,
      {
        "user.all": { table: "user", count: fixture.visibleUsers },
      }
    ),
  });
  await page
    .getByPlaceholder("Search users...")
    .fill("performance-2191-1@example.invalid");
  const users = new ListPage(page);
  await users.openRowActionAndClick(
    users.getRowByText("Synthetic User 2"),
    "Notifications"
  );
  results.push({
    route: "user-notifications",
    queries: await profileZeroQueries(
      page,
      { "notificationPreference.byUser": fixture.preferenceTopics },
      { userId: fixture.sampleUserId },
      {
        "notificationPreference.byUser": {
          table: "notification_topic_preference",
          count: fixture.preferenceTopics,
          userId: fixture.sampleUserId,
        },
      }
    ),
  });
  await page.keyboard.press("Escape");
  results.push({
    route: "personal-preferences",
    queries: await profilePreferences(page, fixture.accountIds.admin),
  });
  const eventDetailStart = performance.now();
  await page.goto(`/events/${fixture.sampleIds.publicEvent}`);
  results.push({
    route: "event-detail",
    queries: [
      ...(await profileZeroQueries(
        page,
        { "teamEvent.byId": 1 },
        { id: fixture.sampleIds.publicEvent }
      )),
      ...(await profileZeroQueries(
        page,
        {
          "eventUpdate.approvedByEvent": fixture.counts.updates! / 2,
          "eventUpdate.pendingByEvent": fixture.counts.updates! / 2,
          "eventPhoto.approvedByEvent": fixture.counts.photos! / 2,
          "eventPhoto.pendingByEvent": fixture.counts.photos! / 2,
          "eventFeedback.byEvent": fixture.counts.feedback!,
        },
        { eventId: fixture.sampleIds.publicEvent },
        {
          "eventUpdate.approvedByEvent": {
            table: "event_update",
            count: fixture.counts.updates! / 2,
          },
          "eventUpdate.pendingByEvent": {
            table: "event_update",
            count: fixture.counts.updates! / 2,
          },
          "eventPhoto.approvedByEvent": {
            table: "event_photo",
            count: fixture.counts.photos! / 2,
          },
          "eventPhoto.pendingByEvent": {
            table: "event_photo",
            count: fixture.counts.photos! / 2,
          },
          "eventFeedback.byEvent": {
            table: "event_feedback",
            count: fixture.counts.feedback!,
          },
        }
      )),
    ],
    navigationAndAnalysisMs: performance.now() - eventDetailStart,
  });
  await expect(
    page.getByText("Synthetic performance update 1", { exact: true })
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Photos & Videos/ }).click();
  await page.getByRole("tab", { name: /^Feedback/ }).click();
  await expect(
    page.getByText("Synthetic performance feedback 1", { exact: true })
  ).toBeVisible();
  const restrictedContext = await browser.newContext({
    storageState: path.resolve(
      import.meta.dirname,
      "../../.auth/volunteer.json"
    ),
  });
  const restrictedResults = [];
  try {
    const restrictedPage = await restrictedContext.newPage();
    await restrictedPage.goto("/events");
    await waitForZeroReady(restrictedPage);
    restrictedResults.push({
      route: "personal-preferences",
      queries: await profilePreferences(
        restrictedPage,
        fixture.accountIds.volunteer
      ),
    });
    restrictedResults.push({
      route: "notifications",
      queries: await profileZeroQueries(
        restrictedPage,
        { "notification.forCurrentUser": 50 },
        undefined,
        {
          "notification.forCurrentUser": {
            table: "notification",
            count: 50,
            ids: fixture.notificationIds.volunteer,
          },
        }
      ),
    });
    for (const [route, queries] of [
      [
        "/reimbursements",
        {
          "reimbursement.all": fixture.restrictedCounts.reimbursements!,
          "advancePayment.all": fixture.restrictedCounts.advances!,
        },
      ],
      [
        "/vendor-payments",
        { "vendorPayment.all": fixture.restrictedCounts.vendorPayments! },
      ],
      [
        "/events",
        { "teamEvent.allAccessible": fixture.restrictedCounts.events! },
      ],
    ] as [string, Record<string, number>][]) {
      await restrictedPage.goto(route);
      restrictedResults.push({
        route,
        queries: await profileZeroQueries(restrictedPage, queries),
      });
    }
    await restrictedPage.goto(`/events/${fixture.sampleIds.publicEvent}`);
    restrictedResults.push({
      route: "event-detail",
      queries: await profileZeroQueries(
        restrictedPage,
        {
          "eventUpdate.approvedByEvent": fixture.counts.updates! / 2,
          "eventUpdate.myPendingByEvent": fixture.counts.updates! / 4,
          "eventPhoto.approvedByEvent": fixture.counts.photos! / 2,
          "eventPhoto.myPendingByEvent": fixture.counts.photos! / 4,
        },
        { eventId: fixture.sampleIds.publicEvent },
        {
          "eventUpdate.approvedByEvent": {
            table: "event_update",
            count: fixture.counts.updates! / 2,
          },
          "eventUpdate.myPendingByEvent": {
            table: "event_update",
            count: fixture.counts.updates! / 4,
          },
          "eventPhoto.approvedByEvent": {
            table: "event_photo",
            count: fixture.counts.photos! / 2,
          },
          "eventPhoto.myPendingByEvent": {
            table: "event_photo",
            count: fixture.counts.photos! / 4,
          },
        }
      ),
    });
    await restrictedPage.getByRole("tab", { name: /^Feedback/ }).click();
    await expect(
      restrictedPage.getByText("Share your anonymous feedback", { exact: true })
    ).toBeVisible();
    expect(
      await restrictedPage.evaluate(async () =>
        (
          await (window as InspectorWindow).__zero.inspector.client.queries()
        ).map((query) => query.name)
      )
    ).not.toContain("eventFeedback.byEvent");
    for (const [route, name, id, minimum] of [
      [
        "reimbursements",
        "reimbursement.byId",
        fixture.sampleIds.ownReimbursement,
        1,
      ],
      [
        "reimbursements",
        "reimbursement.byId",
        fixture.sampleIds.deniedReimbursement,
        0,
      ],
      [
        "vendor-payments",
        "vendorPayment.byId",
        fixture.sampleIds.ownVendorPayment,
        1,
      ],
      [
        "vendor-payments",
        "vendorPayment.byId",
        fixture.sampleIds.deniedVendorPayment,
        0,
      ],
    ] as const) {
      await restrictedPage.goto(`/${route}/${id}`);
      restrictedResults.push({
        route: `/${route}/${minimum ? "own" : "denied"}`,
        queries: await profileZeroQueries(
          restrictedPage,
          { [name]: minimum },
          { id }
        ),
      });
    }
  } finally {
    await restrictedContext.close();
  }
  await info.attach("app-performance.json", {
    body: JSON.stringify({ fixture, results, restrictedResults }, null, 2),
    contentType: "application/json",
  });
  console.log(
    JSON.stringify(
      [...results, ...restrictedResults].map(({ route, queries }) => ({
        route,
        queries: queries.map(({ name, samples }) => ({
          name,
          elapsedMs: samples.map((sample) => sample.elapsedMs),
          readRows: samples.map((sample) => sample.readRows),
          syncedRows: samples.map((sample) => sample.syncedRows),
        })),
      }))
    )
  );
});
