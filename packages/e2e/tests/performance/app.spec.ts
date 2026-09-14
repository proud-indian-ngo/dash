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
    teamId: string;
    counts: Record<string, number>;
    eventExpenseCount: number;
    lookupCounts: { categories: number; groups: number };
    approvedVendorCount: number;
    pendingVendorIds: { admin: string[]; volunteer: string[] };
    restrictedCounts: Record<string, number>;
    notificationIds: { admin: string[]; volunteer: string[] };
    visibleUsers: number;
    whatsappUsers: number;
    preferenceTopics: number;
    sampleUserId: string;
    accountIds: { admin: string; volunteer: string };
    bankAccountCounts: Record<string, number>;
    sampleIds: {
      publicEvent: string;
      ownAdvance: string;
      deniedAdvance: string;
      ownReimbursement: string;
      deniedReimbursement: string;
      ownVendorPayment: string;
      deniedVendorPayment: string;
    };
  };
  expect(JSON.parse((await seed()).stdout.trim())).toEqual(fixture);
  const teamNavigation = [];
  for (let sample = 0; sample < 3; sample++) {
    const context = await browser.newContext({
      storageState: path.resolve(
        import.meta.dirname,
        "../../.auth/super_admin.json"
      ),
    });
    try {
      const target = await context.newPage();
      const measure = async () => {
        const start = performance.now();
        await target.goto(`/teams/${fixture.teamId}`);
        await expect(
          target.getByText(`${fixture.counts.interests} pending interests`, {
            exact: true,
          })
        ).toBeVisible();
        return performance.now() - start;
      };
      const coldMs = await measure();
      await target.goto("/teams");
      const warmMs = await measure();
      teamNavigation.push({ coldMs, warmMs });
    } finally {
      await context.close();
    }
  }
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
    await dialog.getByRole("button", { name: "Banking", exact: true }).click();
    queries.push(
      ...(await profileZeroQueries(
        target,
        {
          "bankAccount.bankAccountsByCurrentUser":
            fixture.bankAccountCounts[userId]!,
        },
        undefined,
        {
          "bankAccount.bankAccountsByCurrentUser": {
            table: "bank_account",
            count: fixture.bankAccountCounts[userId]!,
            userId,
          },
        }
      ))
    );
    await target.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    return queries;
  };
  const profileVendorForm = async (target: Page, pendingIds: string[]) => {
    await target.goto("/vendor-payments/new");
    return profileZeroQueries(
      target,
      {
        "expenseCategory.all": fixture.lookupCounts.categories,
        "vendor.approved": fixture.approvedVendorCount,
        "vendor.pendingByCurrentUser": pendingIds.length,
      },
      undefined,
      {
        "expenseCategory.all": {
          table: "expense_category",
          count: fixture.lookupCounts.categories,
        },
        "vendor.approved": {
          table: "vendor",
          count: fixture.approvedVendorCount,
        },
        "vendor.pendingByCurrentUser": {
          table: "vendor",
          count: pendingIds.length,
          ids: pendingIds,
        },
      }
    );
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
  results.push({
    route: "vendor-form",
    queries: await profileVendorForm(page, fixture.pendingVendorIds.admin),
  });
  await page.goto("/scheduled-messages");
  results.push({
    route: "scheduled-messages",
    queries: await profileZeroQueries(
      page,
      {
        "scheduledMessage.all": fixture.counts.scheduledMessages!,
      },
      undefined,
      {
        "scheduledMessage.all": {
          table: "scheduled_message",
          count: fixture.counts.scheduledMessages!,
          relatedCounts: {
            scheduled_message_recipient: fixture.counts.scheduledRecipients!,
          },
        },
      }
    ),
  });
  await page.getByRole("button", { name: "Schedule message" }).click();
  results.push({
    route: "scheduled-message-recipients",
    queries: await profileZeroQueries(
      page,
      {
        "whatsappGroup.all": fixture.lookupCounts.groups,
        "user.whatsappUsers": fixture.whatsappUsers,
      },
      undefined,
      {
        "whatsappGroup.all": {
          table: "whatsapp_group",
          count: fixture.lookupCounts.groups,
        },
        "user.whatsappUsers": { table: "user", count: fixture.whatsappUsers },
      }
    ),
  });
  await page
    .getByRole("dialog", { name: "Schedule message" })
    .getByRole("button", { name: "Cancel" })
    .click();
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
  await page.goto("/teams");
  results.push({
    route: "teams",
    queries: await profileZeroQueries(page, { "team.all": 1 }, undefined, {
      "team.all": {
        table: "team",
        rowFilter: { id: fixture.teamId },
        count: 1,
      },
    }),
  });
  await page.goto(`/teams/${fixture.teamId}`);
  results.push({
    route: "team-detail",
    queries: [
      ...(await profileZeroQueries(
        page,
        { "team.byId": 1 },
        { id: fixture.teamId },
        {
          "team.byId": {
            table: "team",
            count: 1,
            ids: [fixture.teamId],
          },
        }
      )),
      ...(await profileZeroQueries(
        page,
        { "teamEvent.byTeam": fixture.counts.events! },
        { teamId: fixture.teamId },
        {
          "teamEvent.byTeam": {
            table: "team_event",
            count: fixture.counts.events!,
          },
        }
      )),
    ],
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
          "eventInterest.myByEvent": 1,
          "eventInterest.managerByEvent": 1,
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
          "eventInterest.myByEvent": {
            table: "event_interest",
            count: 1,
            userId: fixture.accountIds.admin,
          },
          "eventInterest.managerByEvent": {
            table: "event_interest",
            count: 1,
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
  await page.getByRole("tab", { name: /^Expenses/ }).click();
  results.push({
    route: "event-expenses",
    queries: await profileZeroQueries(
      page,
      {
        "reimbursement.byEvent": fixture.eventExpenseCount,
        "vendorPayment.byEvent": fixture.eventExpenseCount,
      },
      { eventId: fixture.sampleIds.publicEvent },
      {
        "reimbursement.byEvent": {
          table: "reimbursement",
          count: fixture.eventExpenseCount,
        },
        "vendorPayment.byEvent": {
          table: "vendor_payment",
          count: fixture.eventExpenseCount,
        },
      }
    ),
  });
  const expensePanel = page.getByRole("tabpanel", { name: "Expenses" });
  await expect(
    expensePanel.getByText("₹2,40,000.00", { exact: true })
  ).toBeVisible();
  await expect(
    expensePanel
      .getByRole("link")
      .filter({ hasText: "Synthetic reimbursement 1" })
      .first()
  ).toBeVisible();
  await expect(
    expensePanel
      .getByRole("link")
      .filter({ hasText: "Synthetic performance vendor 1" })
      .first()
  ).toBeVisible();
  await page.goto(`/reimbursements/${fixture.sampleIds.ownAdvance}`);
  results.push({
    route: "advance-detail",
    queries: await profileZeroQueries(
      page,
      {
        "advancePayment.byId": 1,
        "reimbursement.byId": 0,
      },
      { id: fixture.sampleIds.ownAdvance },
      {
        "advancePayment.byId": {
          table: "advance_payment",
          count: 1,
          ids: [fixture.sampleIds.ownAdvance],
          relatedCounts: {
            advance_payment_line_item: 2,
            advance_payment_history: 2,
          },
        },
      }
    ),
  });
  const restrictedContext = await browser.newContext({
    storageState: path.resolve(
      import.meta.dirname,
      "../../.auth/volunteer.json"
    ),
  });
  const restrictedResults = [];
  try {
    const restrictedPage = await restrictedContext.newPage();
    await restrictedPage.goto(`/teams/${fixture.teamId}`);
    await expect(
      restrictedPage.getByText("Team not found.", { exact: true })
    ).toBeVisible();
    restrictedResults.push({
      route: "team-detail-denied",
      queries: await profileZeroQueries(
        restrictedPage,
        { "team.byId": 0 },
        { id: fixture.teamId }
      ),
    });
    expect(
      await restrictedPage.evaluate(async () => {
        const queries = await (
          window as InspectorWindow
        ).__zero.inspector.client.queries();
        return queries.some((query) => query.name === "teamEvent.byTeam");
      })
    ).toBe(false);
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
    restrictedResults.push({
      route: "vendor-form",
      queries: await profileVendorForm(
        restrictedPage,
        fixture.pendingVendorIds.volunteer
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
    await expect(
      restrictedPage.getByRole("tab", { name: /^Expenses/ })
    ).toHaveCount(0);
    restrictedResults.push({
      route: "event-expenses-owner",
      queries: await profileZeroQueries(
        restrictedPage,
        {
          "reimbursement.byEvent": fixture.eventExpenseCount / 2,
          "vendorPayment.byEvent": fixture.eventExpenseCount / 2,
        },
        { eventId: fixture.sampleIds.publicEvent },
        {
          "reimbursement.byEvent": {
            table: "reimbursement",
            count: fixture.eventExpenseCount / 2,
            userId: fixture.accountIds.volunteer,
          },
          "vendorPayment.byEvent": {
            table: "vendor_payment",
            count: fixture.eventExpenseCount / 2,
            userId: fixture.accountIds.volunteer,
          },
        }
      ),
    });
    for (const [id, count] of [
      [fixture.sampleIds.ownAdvance, 1],
      [fixture.sampleIds.deniedAdvance, 0],
    ] as const) {
      await restrictedPage.goto(`/reimbursements/${id}`);
      restrictedResults.push({
        route: `advance-detail/${count ? "own" : "denied"}`,
        queries: await profileZeroQueries(
          restrictedPage,
          {
            "advancePayment.byId": count,
            "reimbursement.byId": 0,
          },
          { id },
          count
            ? {
                "advancePayment.byId": {
                  table: "advance_payment",
                  count,
                  ids: [id],
                  userId: fixture.accountIds.volunteer,
                  relatedCounts: {
                    advance_payment_line_item: 2,
                    advance_payment_history: 2,
                  },
                },
              }
            : undefined
        ),
      });
    }
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
    body: JSON.stringify(
      { fixture, teamNavigation, results, restrictedResults },
      null,
      2
    ),
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
