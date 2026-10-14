import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const UPCOMING_PUBLIC = "E2E Upcoming Public Bangalore";
const UPCOMING_PRIVATE = "E2E Upcoming Private Mumbai";
const PAST_PUBLIC = "E2E Past Public Mumbai";

function eventLink(page: Page, name: string) {
  return page.getByRole("link", { exact: true, name });
}

async function pick(page: Page, select: string, option: string) {
  await page.getByRole("combobox", { name: select }).click();
  await page.getByRole("option", { exact: true, name: option }).click();
}

test.describe("Events agenda", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { exact: true, name: "Events" })
    ).toBeVisible({ timeout: 10_000 });
    await waitForZeroReady(page);
  });

  test("opens on Upcoming, and Past lists what has happened", async ({
    page,
  }) => {
    await expect(page.getByRole("tab", { name: /^Upcoming/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(eventLink(page, UPCOMING_PUBLIC)).toBeVisible();
    await expect(eventLink(page, PAST_PUBLIC)).toBeHidden();

    await page.getByRole("tab", { name: /^Past/ }).click();
    await expect(page).toHaveURL(/when=past/);
    await expect(eventLink(page, PAST_PUBLIC)).toBeVisible();
    await expect(eventLink(page, UPCOMING_PUBLIC)).toBeHidden();
  });

  test("Show narrows to public events and back", async ({ page }) => {
    await expect(eventLink(page, UPCOMING_PUBLIC)).toBeVisible();
    await expect(eventLink(page, UPCOMING_PRIVATE)).toBeVisible();

    await pick(page, "Show", "Public");
    await expect(page).toHaveURL(/show=public/);
    await expect(eventLink(page, UPCOMING_PUBLIC)).toBeVisible();
    await expect(eventLink(page, UPCOMING_PRIVATE)).toBeHidden();

    await pick(page, "Show", "All events");
    await expect(eventLink(page, UPCOMING_PRIVATE)).toBeVisible();
  });

  test("My teams keeps the list to the viewer's teams", async ({ page }) => {
    const links = page.locator("main a[href*='/events/']");
    const allCount = await links.count();

    await pick(page, "Show", "My teams");
    await expect(page).toHaveURL(/show=my-teams/);
    expect(await links.count()).toBeLessThanOrEqual(allCount);

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Show" })).toHaveText(
      /My teams/
    );
  });

  test("City narrows to one city", async ({ page }) => {
    await pick(page, "City", "Bangalore");
    await expect(page).toHaveURL(/city=bangalore/);
    await expect(eventLink(page, UPCOMING_PUBLIC)).toBeVisible();
    await expect(eventLink(page, UPCOMING_PRIVATE)).toBeHidden();
  });

  test("search matches name and location", async ({ page }) => {
    const search = page.getByPlaceholder("Search events...");
    await search.fill("MG Road");
    await expect(eventLink(page, UPCOMING_PUBLIC)).toBeVisible();
    await expect(eventLink(page, UPCOMING_PRIVATE)).toBeHidden();

    await search.clear();
    await expect(eventLink(page, UPCOMING_PRIVATE)).toBeVisible();
  });

  test("a start date moves Upcoming and can be cleared", async ({ page }) => {
    const tomorrowPlusWeek = new Date(Date.now() + 8 * 86_400_000);
    const iso = tomorrowPlusWeek.toISOString().slice(0, 10);
    await page.goto(`/events?from=${iso}`);
    await waitForZeroReady(page);

    // Both seeded upcoming events start within the next week, so they now
    // count as past relative to the chosen date.
    await expect(eventLink(page, UPCOMING_PUBLIC)).toBeHidden();
    const clear = page.getByRole("button", { name: /Clear date/ });
    await expect(clear).toBeVisible();

    await clear.click();
    await expect(page).not.toHaveURL(/from=/);
    await expect(eventLink(page, UPCOMING_PUBLIC)).toBeVisible();
  });

  test("starts with 30 days and loads 30 more on request", async ({ page }) => {
    const until = page.getByText(/^Showing until /);
    await expect(until).toBeVisible();
    const before = await until.textContent();

    await page.getByRole("button", { name: /^Show next 30 days/ }).click();
    await expect(until).not.toHaveText(before ?? "");
    await expect(eventLink(page, UPCOMING_PUBLIC)).toBeVisible();
  });

  test("query params apply on load", async ({ page }) => {
    await page.goto("/events?show=public&city=bangalore");
    await waitForZeroReady(page);
    await expect(page.getByRole("combobox", { name: "Show" })).toHaveText(
      /Public/
    );
    await expect(page.getByRole("combobox", { name: "City" })).toHaveText(
      /Bangalore/
    );
    await expect(eventLink(page, UPCOMING_PUBLIC)).toBeVisible();
  });
});
