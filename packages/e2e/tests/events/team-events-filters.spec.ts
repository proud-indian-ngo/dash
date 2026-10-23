import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { applyQuickFilter } from "../../helpers/quick-filters";
import { fillTableSearch, openSeededTeam } from "../../helpers/team-event";

const TEAM_NAME = "E2E Updates Team";

async function applySelectFilter(page: Page, field: string, value: string) {
  await applyQuickFilter(page, field, value);
}

async function clearFilters(page: Page) {
  await page.getByRole("button", { name: "Clear" }).click();
}

/**
 * Asserts the named seeded events appear in this order in the table. Searches
 * for the seeds' shared description first, so other events on the team can't
 * push them onto a later page, then clears the search.
 */
async function expectRowOrder(page: Page, names: string[]) {
  await fillTableSearch(page, "Search events...", "E2E filter test event");
  await expect
    .poll(async () => {
      const rows = await page
        .getByRole("table")
        .getByRole("row")
        .allTextContents();
      return rows.flatMap((row) => names.filter((name) => row.includes(name)));
    })
    .toEqual(names);
  await page.getByPlaceholder("Search events...").fill("");
  await page.waitForURL((url) => !new URL(url).searchParams.has("search"));
}

test.describe("Team events list filters (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    await openSeededTeam(page, TEAM_NAME);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(TEAM_NAME);
  });

  test("status filters and clearing them", async ({ page }) => {
    const table = page.getByRole("table");
    // Wait for data to load
    await expect(table.getByText("E2E Upcoming Public Bangalore")).toBeVisible({
      timeout: 10_000,
    });
    const initialRows = await table.getByRole("row").count();

    // Upcoming shows only future non-cancelled events
    await applySelectFilter(page, "Status", "Upcoming");
    expect(
      await table.getByText("Upcoming", { exact: true }).count()
    ).toBeGreaterThan(0);
    await expect(table.getByText("Past", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Cancelled", { exact: true })).toHaveCount(0);
    await test.step("upcoming events sort nearest first", () =>
      // Seeded 3 and 5 days ahead
      expectRowOrder(page, [
        "E2E Upcoming Public Bangalore",
        "E2E Upcoming Private Mumbai",
      ]));
    await clearFilters(page);

    // Past shows only past non-cancelled events
    await applySelectFilter(page, "Status", "Past");
    await expect(
      table.getByText("E2E Upcoming Public Bangalore")
    ).not.toBeVisible();
    expect(
      await table.getByText("Past", { exact: true }).count()
    ).toBeGreaterThan(0);
    await expect(table.getByText("Upcoming", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Cancelled", { exact: true })).toHaveCount(0);
    await test.step("past events sort most recent first", () =>
      // Seeded 5 and 10 days ago
      expectRowOrder(page, [
        "E2E Past Private Bangalore",
        "E2E Past Public Mumbai",
      ]));

    // Clearing all filters restores the full list
    await clearFilters(page);
    await expect(
      table.getByText("E2E Upcoming Public Bangalore")
    ).toBeVisible();
    expect(await table.getByRole("row").count()).toBe(initialRows);

    // The byTeam Zero query filters out cancelled events (cancelledAt IS NULL),
    // so the Cancelled filter shows the empty state.
    await applySelectFilter(page, "Status", "Cancelled");
    await expect(page.getByText("No events found")).toBeVisible();
  });

  test("visibility, recurrence and combined filters", async ({ page }) => {
    const table = page.getByRole("table");
    const publicCells = table
      .getByRole("cell")
      .getByText("Public", { exact: true });
    const privateCells = table
      .getByRole("cell")
      .getByText("Private", { exact: true });
    const recurringText = table.getByText("E2E Upcoming Recurring Public");
    const oneTimeText = table.getByText("E2E Upcoming Public Bangalore");
    await expect(oneTimeText).toBeVisible({ timeout: 10_000 });

    await applySelectFilter(page, "Visibility", "Public");
    expect(await publicCells.count()).toBeGreaterThan(0);
    await expect(privateCells).toHaveCount(0);
    await clearFilters(page);

    await applySelectFilter(page, "Visibility", "Private");
    expect(await privateCells.count()).toBeGreaterThan(0);
    // No "Public" badges in cells (column header "Public" may still exist)
    await expect(publicCells).toHaveCount(0);
    await test.step("upcoming events sort before past ones", () =>
      // Seeded 5 days ahead and 5 days ago
      expectRowOrder(page, [
        "E2E Upcoming Private Mumbai",
        "E2E Past Private Bangalore",
      ]));
    await clearFilters(page);

    // Recurring keeps the series and hides one-time events
    await expect(recurringText.first()).toBeVisible();
    await applySelectFilter(page, "Recurrence", "Recurring");
    await expect(recurringText.first()).toBeVisible();
    await expect(oneTimeText).not.toBeVisible();
    await clearFilters(page);

    await applySelectFilter(page, "Recurrence", "One-time");
    await expect(oneTimeText).toBeVisible();
    await expect(recurringText).not.toBeVisible();
    await clearFilters(page);

    // Status + Visibility intersect
    await applySelectFilter(page, "Status", "Upcoming");
    await applySelectFilter(page, "Visibility", "Public");
    await expect(oneTimeText).toBeVisible();
    await expect(table.getByText("Private", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Past", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Cancelled", { exact: true })).toHaveCount(0);
  });

  test("search by event name is case-insensitive", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search events...");
    const table = page.getByRole("table");

    await searchInput.fill("Upcoming Public Bangalore");
    await page.waitForTimeout(500);
    await expect(
      table.getByText("E2E Upcoming Public Bangalore")
    ).toBeVisible();
    // Other events should not be visible
    await expect(
      table.getByText("E2E Upcoming Private Mumbai")
    ).not.toBeVisible();

    await searchInput.fill("upcoming public bangalore");
    await page.waitForTimeout(500);
    await expect(
      table.getByText("E2E Upcoming Public Bangalore")
    ).toBeVisible();
  });
});

test.describe("Team events list (volunteer permissions)", () => {
  test("volunteer does NOT see Create event button on team they don't lead", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await openSeededTeam(page, TEAM_NAME);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(TEAM_NAME);

    await expect(
      page.getByRole("button", { name: "Create event" })
    ).not.toBeVisible();
  });
});
