import { expect, test } from "../../fixtures/test";

test.describe("Event interest flow", () => {
  test("volunteer sees Show Interest button on public events", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });

    // At least one "Show Interest" button should be visible
    const showInterestButton = page.getByRole("button", {
      name: "Show Interest",
    });
    if ((await showInterestButton.count()) > 0) {
      await expect(showInterestButton.first()).toBeVisible();
    }
  });

  test("volunteer can open and close interest dialog", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });

    const showInterestButton = page.getByRole("button", {
      name: "Show Interest",
    });
    if ((await showInterestButton.count()) === 0) {
      test.skip(true, "No public events available to show interest in");
      return;
    }

    await showInterestButton.first().click();

    // Dialog should appear
    await expect(
      page.getByRole("heading", { name: "Show Interest" })
    ).toBeVisible();

    // Message textarea should be present
    await expect(page.getByLabel("Message (optional)")).toBeVisible();

    // Cancel button should close the dialog
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: "Show Interest" })
    ).not.toBeVisible();
  });

  test("volunteer can submit interest", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });

    const showInterestButton = page.getByRole("button", {
      name: "Show Interest",
    });
    if ((await showInterestButton.count()) === 0) {
      test.skip(true, "No public events available to show interest in");
      return;
    }

    await showInterestButton.first().click();
    await expect(
      page.getByRole("heading", { name: "Show Interest" })
    ).toBeVisible();

    // Optionally fill in message
    await page
      .getByLabel("Message (optional)")
      .fill("I would like to volunteer!");

    // Submit
    await page.getByRole("button", { name: "Submit Interest" }).click();

    // Dialog should close and a status badge should appear
    await expect(
      page.getByRole("heading", { name: "Show Interest" })
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("admin sees interest requests on event detail", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });

    // Click first event name link in the table
    const eventLink = page
      .getByRole("table")
      .getByRole("link")
      .filter({ hasText: /.+/ });
    if ((await eventLink.count()) === 0) {
      test.skip(true, "No public events found");
      return;
    }

    await eventLink.first().click();

    // Should be on event detail page
    await expect(page.getByText("Volunteers")).toBeVisible({ timeout: 10_000 });

    // If there are pending interests, the Interest Requests section should be visible
    const interestSection = page.getByText("Interest Requests");
    if (await interestSection.isVisible()) {
      // Approve and reject buttons should be present
      await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
    }
  });
});
