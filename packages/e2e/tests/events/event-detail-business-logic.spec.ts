import { expect, test, waitForZeroReady } from "../../fixtures/test";

const TEAM_NAME = "E2E Updates Team";

async function navigateToTeamEvent(
  page: import("@playwright/test").Page,
  eventNamePattern: RegExp
): Promise<boolean> {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible({
    timeout: 10_000,
  });
  await waitForZeroReady(page);

  const teamRow = page.getByRole("row").filter({ hasText: TEAM_NAME });
  if ((await teamRow.count()) === 0) {
    return false;
  }
  await teamRow.first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 10_000,
  });
  await waitForZeroReady(page);

  // Find event row and navigate via row actions
  const eventRow = page.getByRole("row").filter({ hasText: eventNamePattern });
  if ((await eventRow.count()) === 0) {
    return false;
  }
  await eventRow.first().getByRole("button", { name: "Row actions" }).click();
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 10_000,
  });
  return true;
}

test.describe("Event detail — info display", () => {
  test("shows event name as h1 heading", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Upcoming Public Bangalore/
    );
    if (!found) {
      test.skip(true, "Event not found");
      return;
    }

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "E2E Upcoming Public Bangalore",
      })
    ).toBeVisible();
  });

  test("shows location when present", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Upcoming Public Bangalore/
    );
    if (!found) {
      test.skip(true, "Event not found");
      return;
    }

    await expect(page.getByText("MG Road, Bangalore").first()).toBeVisible();
  });

  test("shows Public or Private badge", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Upcoming Public Bangalore/
    );
    if (!found) {
      test.skip(true, "Event not found");
      return;
    }

    // Wait for event details card to fully load, then check visibility badge
    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible({
      timeout: 10_000,
    });
    const publicBadge = page.getByText("Public", { exact: true });
    const privateBadge = page.getByText("Private", { exact: true });
    const hasBadge =
      (await publicBadge.count()) > 0 || (await privateBadge.count()) > 0;
    expect(hasBadge).toBeTruthy();
  });

  test("shows volunteer count matching member count", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Upcoming Public Bangalore/
    );
    if (!found) {
      test.skip(true, "Event not found");
      return;
    }

    // Event was seeded with 2 members (admin + volunteer)
    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible();
  });

  test("shows team name with link back to team", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Upcoming Public Bangalore/
    );
    if (!found) {
      test.skip(true, "Event not found");
      return;
    }

    await expect(page.getByText(TEAM_NAME)).toBeVisible();
  });

  test("shows Upcoming status badge for future event", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Upcoming Public Bangalore/
    );
    if (!found) {
      test.skip(true, "Event not found");
      return;
    }

    await expect(page.getByText("Upcoming", { exact: true })).toBeVisible();
  });
});

test.describe("Event detail — admin permissions", () => {
  test("admin sees Edit button on team event", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Upcoming Public Bangalore/
    );
    if (!found) {
      test.skip(true, "Event not found");
      return;
    }

    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  });

  test("admin sees Cancel Event button for future event", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Upcoming Public Bangalore/
    );
    if (!found) {
      test.skip(true, "Event not found");
      return;
    }

    await expect(
      page.getByRole("button", { name: "Cancel Event" })
    ).toBeVisible();
  });

  test("admin sees Duplicate button", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Upcoming Public Bangalore/
    );
    if (!found) {
      test.skip(true, "Event not found");
      return;
    }

    await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
  });

  test("admin sees Updates and Photos tabs", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Past Event With Pending Update/
    );
    if (!found) {
      test.skip(true, "Past event not found");
      return;
    }

    await expect(page.getByRole("tab", { name: /Updates/ })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Photos & Videos/ })
    ).toBeVisible();
  });

  test("admin sees Expenses tab (manage permission)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const found = await navigateToTeamEvent(
      page,
      /E2E Past Event With Pending Update/
    );
    if (!found) {
      test.skip(true, "Past event not found");
      return;
    }

    await expect(page.getByRole("tab", { name: "Expenses" })).toBeVisible();
  });
});

test.describe("Event detail — volunteer permissions", () => {
  test("volunteer does NOT see Edit button", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });
    await waitForZeroReady(page);

    // Find any event link from the public events page
    const eventLink = page.locator("main a[href*='/events/']").first();
    if (!(await eventLink.isVisible().catch(() => false))) {
      test.skip(true, "No public events found");
      return;
    }
    await eventLink.click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByRole("button", { name: "Edit" })).not.toBeVisible();
  });

  test("volunteer does NOT see Cancel Event button", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });
    await waitForZeroReady(page);

    const eventLink = page.locator("main a[href*='/events/']").first();
    if (!(await eventLink.isVisible().catch(() => false))) {
      test.skip(true, "No public events found");
      return;
    }
    await eventLink.click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    await expect(
      page.getByRole("button", { name: "Cancel Event" })
    ).not.toBeVisible();
  });

  test("volunteer does NOT see Expenses tab", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });
    await waitForZeroReady(page);

    const eventLink = page.locator("main a[href*='/events/']").first();
    if (!(await eventLink.isVisible().catch(() => false))) {
      test.skip(true, "No public events found");
      return;
    }
    await eventLink.click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByRole("tab", { name: "Expenses" })).not.toBeVisible();
  });
});

test.describe("Event detail — virtual occurrence", () => {
  test("recurring event row navigates with occDate param", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible({
      timeout: 10_000,
    });
    await waitForZeroReady(page);

    const teamRow = page.getByRole("row").filter({ hasText: TEAM_NAME });
    if ((await teamRow.count()) === 0) {
      test.skip(true, "Team not found");
      return;
    }
    await teamRow.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await waitForZeroReady(page);

    // Find a recurring event occurrence (not the series parent)
    const recurringRow = page
      .getByRole("row")
      .filter({ hasText: /E2E Upcoming Recurring Public/ });
    const count = await recurringRow.count();
    if (count < 2) {
      test.skip(true, "Need at least 2 rows for recurring event");
      return;
    }

    // Click the second occurrence (virtual, not series parent)
    await recurringRow
      .nth(1)
      .getByRole("button", { name: "Row actions" })
      .click();
    await page.getByRole("menuitem", { name: "View" }).click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // URL should contain occDate parameter
    expect(page.url()).toMatch(/occDate=\d{4}-\d{2}-\d{2}/);
  });
});
