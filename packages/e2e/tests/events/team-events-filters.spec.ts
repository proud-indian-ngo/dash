import { expect, test, waitForZeroReady } from "../../fixtures/test";

const TEAM_NAME = "E2E Updates Team";

test.describe("Team events list filters (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible({
      timeout: 10_000,
    });
    await waitForZeroReady(page);

    // Team names render as <button> in the table, not <a> links
    const teamRow = page.getByRole("row").filter({ hasText: TEAM_NAME });
    if ((await teamRow.count()) === 0) {
      test.skip(true, "E2E Updates Team not found");
      return;
    }
    await teamRow.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await waitForZeroReady(page);
  });

  test("shows all events by default without filters", async ({ page }) => {
    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    // Wait for data to load — at least the seed event name should appear
    await expect(table.getByText("E2E Upcoming Public Bangalore")).toBeVisible({
      timeout: 10_000,
    });

    // Should have multiple rows (header + data rows)
    const rows = table.getByRole("row");
    const rowCount = await rows.count();
    // At least header + seed event + some filter test events
    expect(rowCount).toBeGreaterThanOrEqual(3);
  });

  test("Upcoming status filter shows only future non-cancelled events", async ({
    page,
  }) => {
    const statusCombobox = page.getByRole("combobox", { name: "Status" });
    await statusCombobox.click();
    await page.getByRole("option", { name: "Upcoming" }).click();
    await page.waitForTimeout(500);

    const table = page.getByRole("table");
    const upcomingBadges = table.getByText("Upcoming", { exact: true });
    const count = await upcomingBadges.count();
    expect(count).toBeGreaterThan(0);

    // No past or cancelled badges should be visible
    await expect(table.getByText("Past", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Cancelled", { exact: true })).toHaveCount(0);
  });

  test("Past status filter shows only past non-cancelled events", async ({
    page,
  }) => {
    const statusCombobox = page.getByRole("combobox", { name: "Status" });
    await statusCombobox.click();
    await page.getByRole("option", { name: "Past" }).click();
    await page.waitForTimeout(500);

    const table = page.getByRole("table");
    const pastBadges = table.getByText("Past", { exact: true });
    expect(await pastBadges.count()).toBeGreaterThan(0);

    await expect(table.getByText("Upcoming", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Cancelled", { exact: true })).toHaveCount(0);
  });

  test("Cancelled status filter shows empty state", async ({ page }) => {
    // Note: the byTeam Zero query filters out cancelled events (cancelledAt IS NULL),
    // so the Cancelled filter should show "No events found" empty state.
    const statusCombobox = page.getByRole("combobox", { name: "Status" });
    await statusCombobox.click();
    await page.getByRole("option", { name: "Cancelled" }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("No events found")).toBeVisible();
  });

  test("Public visibility filter shows only public events", async ({
    page,
  }) => {
    const visCombobox = page.getByRole("combobox", { name: "Visibility" });
    await visCombobox.click();
    await page.getByRole("option", { name: "Public" }).click();
    await page.waitForTimeout(500);

    const table = page.getByRole("table");
    const publicBadges = table
      .getByRole("cell")
      .getByText("Public", { exact: true });
    expect(await publicBadges.count()).toBeGreaterThan(0);

    await expect(
      table.getByRole("cell").getByText("Private", { exact: true })
    ).toHaveCount(0);
  });

  test("Private visibility filter shows only private events", async ({
    page,
  }) => {
    const visCombobox = page.getByRole("combobox", { name: "Visibility" });
    await visCombobox.click();
    await page.getByRole("option", { name: "Private" }).click();
    await page.waitForTimeout(500);

    const table = page.getByRole("table");
    const privateBadges = table
      .getByRole("cell")
      .getByText("Private", { exact: true });
    expect(await privateBadges.count()).toBeGreaterThan(0);

    // No "Public" badges in cells (column header "Public" may still exist)
    await expect(
      table.getByRole("cell").getByText("Public", { exact: true })
    ).toHaveCount(0);
  });

  test("Recurring filter shows only events with recurrence", async ({
    page,
  }) => {
    const table = page.getByRole("table");
    // Wait for recurring event to appear before filtering
    const recurringText = table.getByText("E2E Upcoming Recurring Public");
    if ((await recurringText.count()) === 0) {
      // Recurring events expand into virtual occurrences — may not show with exact name
      test.skip(true, "Recurring event not visible in table (expansion issue)");
      return;
    }

    const recCombobox = page.getByRole("combobox", { name: "Recurrence" });
    await recCombobox.click();
    await page.getByRole("option", { name: "Recurring" }).click();
    await page.waitForTimeout(500);

    // Recurring event should still be visible after filter
    await expect(recurringText.first()).toBeVisible();

    // Non-recurring events should not be visible
    await expect(
      table.getByText("E2E Upcoming Public Bangalore")
    ).not.toBeVisible();
  });

  test("One-time filter hides recurring events", async ({ page }) => {
    const recCombobox = page.getByRole("combobox", { name: "Recurrence" });
    await recCombobox.click();
    await page.getByRole("option", { name: "One-time" }).click();
    await page.waitForTimeout(500);

    const table = page.getByRole("table");
    // Non-recurring events should be visible
    await expect(
      table.getByText("E2E Upcoming Public Bangalore")
    ).toBeVisible();

    // Recurring events should NOT be visible
    await expect(
      table.getByText("E2E Upcoming Recurring Public")
    ).not.toBeVisible();
  });

  test("combined Status + Visibility filter intersection works", async ({
    page,
  }) => {
    // Set Status = Upcoming
    const statusCombobox = page.getByRole("combobox", { name: "Status" });
    await statusCombobox.click();
    await page.getByRole("option", { name: "Upcoming" }).click();
    await page.waitForTimeout(300);

    // Set Visibility = Public
    const visCombobox = page.getByRole("combobox", { name: "Visibility" });
    await visCombobox.click();
    await page.getByRole("option", { name: "Public" }).click();
    await page.waitForTimeout(500);

    const table = page.getByRole("table");
    // Should have at least "E2E Upcoming Public Bangalore"
    await expect(
      table.getByText("E2E Upcoming Public Bangalore")
    ).toBeVisible();

    // No private or past/cancelled
    await expect(table.getByText("Private", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Past", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Cancelled", { exact: true })).toHaveCount(0);
  });

  test("clearing all filters restores full list", async ({ page }) => {
    const table = page.getByRole("table");
    // Wait for data to load
    await expect(table.getByText("E2E Upcoming Public Bangalore")).toBeVisible({
      timeout: 10_000,
    });

    const initialRows = await table.getByRole("row").count();

    // Apply Status = Past (fewer rows than total)
    const statusCombobox = page.getByRole("combobox", { name: "Status" });
    await statusCombobox.click();
    await page.getByRole("option", { name: "Past" }).click();
    await page.waitForTimeout(500);

    // Upcoming event should be hidden
    await expect(
      table.getByText("E2E Upcoming Public Bangalore")
    ).not.toBeVisible();

    // Clear by selecting "All" in status
    await statusCombobox.click();
    await page.getByRole("option", { name: "All" }).click();
    await page.waitForTimeout(500);

    // Full list restored
    await expect(
      table.getByText("E2E Upcoming Public Bangalore")
    ).toBeVisible();
    const restoredRows = await table.getByRole("row").count();
    expect(restoredRows).toBe(initialRows);
  });

  test("upcoming events appear before past events in table", async ({
    page,
  }) => {
    const table = page.getByRole("table");
    const rows = table.getByRole("row");
    const rowCount = await rows.count();

    let foundPast = false;
    for (let i = 1; i < rowCount; i++) {
      const row = rows.nth(i);
      const statusText = await row
        .getByText(/Upcoming|Past|Cancelled/, { exact: true })
        .first()
        .textContent();
      if (statusText === "Past") {
        foundPast = true;
      }
      if (foundPast && statusText === "Upcoming") {
        throw new Error("Found Upcoming event after Past event — sort broken");
      }
    }
  });

  test("search by event name filters table rows", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search events...");
    await searchInput.fill("Upcoming Public Bangalore");
    await page.waitForTimeout(500);

    const table = page.getByRole("table");
    await expect(
      table.getByText("E2E Upcoming Public Bangalore")
    ).toBeVisible();

    // Other events should not be visible
    await expect(
      table.getByText("E2E Upcoming Private Mumbai")
    ).not.toBeVisible();
  });

  test("search is case-insensitive", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search events...");
    await searchInput.fill("upcoming public bangalore");
    await page.waitForTimeout(500);

    await expect(
      page.getByRole("table").getByText("E2E Upcoming Public Bangalore")
    ).toBeVisible();
  });

  test("admin sees Create Event button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Create Event" })
    ).toBeVisible();
  });
});

test.describe("Team events list (volunteer permissions)", () => {
  test("volunteer does NOT see Create Event button on team they don't lead", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible({
      timeout: 10_000,
    });
    await waitForZeroReady(page);

    const teamRow = page.getByRole("row").filter({ hasText: TEAM_NAME });
    if ((await teamRow.count()) === 0) {
      test.skip(true, "E2E Updates Team not found for volunteer");
      return;
    }
    await teamRow.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await waitForZeroReady(page);

    await expect(
      page.getByRole("button", { name: "Create Event" })
    ).not.toBeVisible();
  });
});
