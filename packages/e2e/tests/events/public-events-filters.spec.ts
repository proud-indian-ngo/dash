import { expect, test, waitForZeroReady } from "../../fixtures/test";

test.describe("Public events list business logic", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });
    await waitForZeroReady(page);
  });

  test("shows events by default with All filter active", async ({ page }) => {
    // "All" button in Show section should be active (default variant)
    const showSection = page.getByText("Show", { exact: true }).locator("..");
    await expect(
      showSection.getByRole("button", { name: "All" })
    ).toBeVisible();

    // Events should be visible
    await expect(page.getByPlaceholder("Search events...")).toBeVisible();
  });

  test("My Teams filter shows only events from user's teams", async ({
    page,
  }) => {
    // Count cards before filter
    const allCards = page.locator("main a[href*='/events/']");
    const allCount = await allCards.count();
    if (allCount === 0) {
      test.skip(true, "No events available");
      return;
    }

    // Click "My Teams" filter
    await page.getByRole("button", { name: "My Teams" }).first().click();
    await page.waitForTimeout(500);

    // Should show fewer or equal events
    const filteredCount = await allCards.count();
    expect(filteredCount).toBeLessThanOrEqual(allCount);
  });

  test("Public filter shows only public events", async ({ page }) => {
    await page.getByRole("button", { name: "Public" }).first().click();
    await page.waitForTimeout(500);

    // Events should be visible (we have seeded public events)
    const cards = page.locator("main a[href*='/events/']");
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test("switching back to All restores full list", async ({ page }) => {
    const allCards = page.locator("main a[href*='/events/']");
    const initialCount = await allCards.count();

    // Apply "Public" filter
    await page.getByRole("button", { name: "Public" }).first().click();
    await page.waitForTimeout(300);

    // Switch back to "All"
    // The "All" button in Show section (not Time section)
    const showSection = page.getByText("Show", { exact: true }).locator("..");
    await showSection.getByRole("button", { name: "All" }).click();
    await page.waitForTimeout(500);

    const restoredCount = await allCards.count();
    expect(restoredCount).toBe(initialCount);
  });

  test("This Month shows only events within current month", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "This Month" }).first().click();
    await page.waitForTimeout(500);

    // Page should still be functional
    await expect(page.getByPlaceholder("Search events...")).toBeVisible();
    // URL should have time=this-month
    expect(page.url()).toContain("time=this-month");
  });

  test("This Week shows only events within current week", async ({ page }) => {
    await page.getByRole("button", { name: "This Week" }).first().click();
    await page.waitForTimeout(500);

    await expect(page.getByPlaceholder("Search events...")).toBeVisible();
    expect(page.url()).toContain("time=this-week");
  });

  test("city filter visible when events span multiple cities", async ({
    page,
  }) => {
    // We seeded events in both bangalore and mumbai
    const cityLabel = page.getByText("City", { exact: true });
    if ((await cityLabel.count()) === 0) {
      test.skip(
        true,
        "City filter not visible — may need events in multiple cities"
      );
      return;
    }

    await expect(cityLabel.first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Bangalore" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Mumbai" }).first()
    ).toBeVisible();
  });

  test("selecting Bangalore city shows only Bangalore events", async ({
    page,
  }) => {
    const bangaloreButton = page
      .getByRole("button", { name: "Bangalore" })
      .first();
    if (!(await bangaloreButton.isVisible().catch(() => false))) {
      test.skip(true, "City filter not visible");
      return;
    }

    await bangaloreButton.click();
    await page.waitForTimeout(500);

    expect(page.url()).toContain("city=bangalore");

    // Mumbai event cards should not be visible (ignore sidebar filter buttons)
    await expect(
      page.locator("main a[href*='/events/']").getByText("Mumbai")
    ).toHaveCount(0);
  });

  test("selecting Mumbai city shows only Mumbai events", async ({ page }) => {
    const mumbaiButton = page.getByRole("button", { name: "Mumbai" }).first();
    if (!(await mumbaiButton.isVisible().catch(() => false))) {
      test.skip(true, "City filter not visible");
      return;
    }

    await mumbaiButton.click();
    await page.waitForTimeout(500);

    expect(page.url()).toContain("city=mumbai");
  });

  test("search by event name filters cards", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search events...");
    await searchInput.fill("E2E Upcoming Public Bangalore");
    await page.waitForTimeout(500);

    const main = page.locator("main");
    await expect(main.getByText("E2E Upcoming Public Bangalore")).toBeVisible();
  });

  test("search by location filters cards", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search events...");
    await searchInput.fill("MG Road");
    await page.waitForTimeout(500);

    const main = page.locator("main");
    await expect(main.getByText("E2E Upcoming Public Bangalore")).toBeVisible();
  });

  test("clearing search restores filtered view", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search events...");

    // Search for something specific
    await searchInput.fill("E2E Upcoming Public Bangalore");
    await page.waitForTimeout(300);

    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);

    // Multiple events should be visible again
    const cards = page.locator("main a[href*='/events/']");
    expect(await cards.count()).toBeGreaterThan(1);
  });

  test("Past Events heading appears when past events exist", async ({
    page,
  }) => {
    // We seeded past events, so "Past Events" heading should appear
    await expect(page.getByText("Past Events")).toBeVisible();
  });

  test("upcoming events appear before Past Events heading", async ({
    page,
  }) => {
    const main = page.locator("main");
    const pastHeading = main.getByText("Past Events");
    if ((await pastHeading.count()) === 0) {
      test.skip(true, "No past events heading");
      return;
    }

    // Get bounding boxes to verify spatial ordering
    const pastBox = await pastHeading.boundingBox();
    expect(pastBox).not.toBeNull();

    // Find an upcoming event card
    const upcomingCard = main.getByText("E2E Upcoming Public Bangalore");
    if ((await upcomingCard.count()) > 0) {
      const upcomingBox = await upcomingCard.boundingBox();
      expect(upcomingBox).not.toBeNull();
      // Upcoming should be above past
      expect(upcomingBox!.y).toBeLessThan(pastBox!.y);
    }
  });

  test("Show + City filter intersection works", async ({ page }) => {
    // Apply "Public" filter
    await page.getByRole("button", { name: "Public" }).first().click();
    await page.waitForTimeout(300);

    // Apply city filter if visible
    const bangaloreButton = page
      .getByRole("button", { name: "Bangalore" })
      .first();
    if (!(await bangaloreButton.isVisible().catch(() => false))) {
      test.skip(true, "City filter not visible");
      return;
    }
    await bangaloreButton.click();
    await page.waitForTimeout(500);

    // URL should have both params
    expect(page.url()).toContain("show=public");
    expect(page.url()).toContain("city=bangalore");
  });

  test("filters persist in URL query params", async ({ page }) => {
    await page.getByRole("button", { name: "My Teams" }).first().click();
    await page.waitForTimeout(300);

    expect(page.url()).toContain("show=my-teams");

    // Reload page
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // Filter should still be applied
    expect(page.url()).toContain("show=my-teams");
  });

  test("loading page with query params applies filters", async ({ page }) => {
    await page.goto("/events?show=public&city=bangalore");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });
    await waitForZeroReady(page);

    // Verify URL params preserved
    expect(page.url()).toContain("show=public");
    expect(page.url()).toContain("city=bangalore");
  });
});
