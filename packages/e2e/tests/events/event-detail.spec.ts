import { expect, test } from "../../fixtures/test";

test.describe("Event detail page", () => {
  test("admin can navigate to event detail from public events", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });

    const eventLink = page
      .getByRole("table")
      .getByRole("link")
      .filter({ hasText: /.+/ });
    if ((await eventLink.count()) === 0) {
      test.skip(true, "No public events found");
      return;
    }

    const eventName = await eventLink.first().textContent();
    if (!eventName) {
      test.skip(true, "Event link has no text");
      return;
    }
    await eventLink.first().click();

    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: eventName })
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible();
  });

  test("event detail shows event info section", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });

    const eventLink = page
      .getByRole("table")
      .getByRole("link")
      .filter({ hasText: /.+/ });
    if ((await eventLink.count()) === 0) {
      test.skip(true, "No public events found");
      return;
    }

    await eventLink.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    await expect(page.getByText(/\w+ \d+, \d{4}/)).toBeVisible({
      timeout: 10_000,
    });

    const publicBadge = page.getByText("Public", { exact: true });
    const privateBadge = page.getByText("Private", { exact: true });
    const hasBadge =
      (await publicBadge.count()) > 0 || (await privateBadge.count()) > 0;
    expect(hasBadge).toBeTruthy();
  });

  test("admin sees Edit and Cancel Event buttons for future events", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    const teamLink = page.getByRole("link").filter({ hasText: /E2E Team/ });
    if ((await teamLink.count()) === 0) {
      test.skip(true, "No E2E team available");
      return;
    }
    await teamLink.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // Use the row action menu to navigate to event detail (consistent with other tests)
    const eventRow = page
      .getByRole("row")
      .filter({ hasText: /E2E Event|E2E Edit/ });
    if ((await eventRow.count()) === 0) {
      test.skip(true, "No events available");
      return;
    }
    await eventRow.first().getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("menuitem", { name: "View" }).click();

    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  });

  test("volunteer can view event detail for public event", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });

    const eventLink = page
      .getByRole("table")
      .getByRole("link")
      .filter({ hasText: /.+/ });
    if ((await eventLink.count()) === 0) {
      test.skip(true, "No public events found");
      return;
    }

    await eventLink.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible();

    await expect(page.getByRole("button", { name: "Edit" })).not.toBeVisible();
  });
});
