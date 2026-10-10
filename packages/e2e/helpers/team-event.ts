import { expect, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";
import { ListPage } from "../pages/list-page";

const SEED_TEAM_NAME = "E2E Updates Team";

/** Opens the seeded team's page, where its events table lives. */
export async function openSeededTeam(page: Page) {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible({
    timeout: 10_000,
  });
  await waitForZeroReady(page);
  // Search so the row is on the first page whatever the fitted page size.
  await page.getByPlaceholder("Search teams...").fill(SEED_TEAM_NAME);
  await page
    .getByRole("row")
    .filter({ hasText: SEED_TEAM_NAME })
    .first()
    .click();
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
  await page.getByPlaceholder("Search events...").fill(eventName);
  const eventRow = page.getByRole("row").filter({ hasText: eventName });
  await new ListPage(page).openRowActionAndClick(eventRow.first(), "View");
  await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
  await waitForZeroReady(page);
}

/** Opens a public event from the /events cards by its name. */
export async function openPublicEvent(page: Page, eventName: string) {
  await page.goto("/events");
  await expect(
    page.getByRole("heading", { exact: true, name: "Events" })
  ).toBeVisible({ timeout: 10_000 });
  await waitForZeroReady(page);
  await page
    .getByRole("link", { exact: true, name: eventName })
    .first()
    .click();
  await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 10_000,
  });
  await waitForZeroReady(page);
}
