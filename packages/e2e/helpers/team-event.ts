import { expect, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";
import { ListPage } from "../pages/list-page";

const SEED_TEAM_NAME = "E2E Updates Team";

/**
 * Types into a data table's search box and waits for the value to reach the
 * URL. The box writes ?search= 300ms after typing; a click made before that
 * starts a navigation the late URL update then cancels.
 */
export async function fillTableSearch(
  page: Page,
  placeholder: string,
  value: string
) {
  await page.getByPlaceholder(placeholder).fill(value);
  await page.waitForURL(
    (url) => new URL(url).searchParams.get("search") === value
  );
}

/** Opens a seeded team's page, where its events table lives. */
export async function openSeededTeam(page: Page, teamName = SEED_TEAM_NAME) {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible({
    timeout: 10_000,
  });
  await waitForZeroReady(page);
  // Search so the row is on the first page whatever the fitted page size.
  await fillTableSearch(page, "Search teams...", teamName);
  await page.getByRole("row").filter({ hasText: teamName }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 10_000,
  });
  await waitForZeroReady(page);
}

/**
 * Opens a seeded event through its team's event list. The /events page shows
 * cards and a calendar, so the team table is the stable route to a named event.
 */
export async function openSeededTeamEvent(page: Page, eventName: string) {
  await openSeededTeam(page);
  await fillTableSearch(page, "Search events...", eventName);
  const eventRow = page.getByRole("row").filter({ hasText: eventName });
  await new ListPage(page).openRowActionAndClick(eventRow.first(), "View");
  await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
  await waitForZeroReady(page);
}

/**
 * Opens a public event from the /events cards by its name. The page lists the
 * selected month (plus a week either side), so step forward when a seeded
 * event falls in next month.
 */
export async function openPublicEvent(page: Page, eventName: string) {
  await page.goto(`/events?s=${encodeURIComponent(eventName)}`);
  await expect(
    page.getByRole("heading", { exact: true, name: "Events" })
  ).toBeVisible({ timeout: 10_000 });
  await waitForZeroReady(page);
  const link = page.getByRole("link", { exact: true, name: eventName }).first();
  for (let month = 0; month < 2; month++) {
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      break;
    }
    await page
      .getByRole("button", { name: /next month/i })
      .first()
      .click();
  }
  await link.click();
  await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 10_000,
  });
  await waitForZeroReady(page);
}

/**
 * Narrows a team's paged, date-sorted event list to one name, so a newly
 * created event is on screen. Does nothing off the team page.
 */
export async function searchTeamEvents(page: Page, eventName: string) {
  const search = page.getByPlaceholder("Search events...");
  if (await search.isVisible().catch(() => false)) {
    await search.fill(eventName);
  }
}
