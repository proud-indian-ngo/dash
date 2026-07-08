import type { Page } from "@playwright/test";
import { expect, test, waitForZeroReady } from "../../fixtures/test";

async function navigateToPublicEvent(page: Page, eventName: string) {
  await page.goto("/events");
  await expect(
    page.getByRole("heading", { exact: true, name: "Events" })
  ).toBeVisible({
    timeout: 10_000,
  });
  await waitForZeroReady(page);

  await page.getByPlaceholder("Search events...").fill(eventName);
  await expect(page.getByRole("link", { name: eventName })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("link", { name: eventName }).click();
  await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: eventName })
  ).toBeVisible({
    timeout: 10_000,
  });
  await waitForZeroReady(page);
}

test.describe("Event expenses", () => {
  test("expense rows link to reimbursement and vendor payment details", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await navigateToPublicEvent(page, "E2E Past Event With Pending Update");
    await page.getByRole("tab", { name: "Expenses" }).click();

    await expect(
      page.getByRole("link", { name: /E2E Seed Reimbursement/ })
    ).toBeVisible();
    await page.getByRole("link", { name: /E2E Seed Reimbursement/ }).click();
    await page.waitForURL(
      /\/reimbursements\/e2e00000-0000-0000-0000-000000000001/
    );
    await expect(
      page.getByRole("heading", { name: "E2E Seed Reimbursement" })
    ).toBeVisible({ timeout: 10_000 });

    await navigateToPublicEvent(page, "E2E Past Event With Pending Update");
    await page.getByRole("tab", { name: "Expenses" }).click();

    await expect(
      page.getByRole("link", { name: /E2E Event Vendor Payment/ })
    ).toBeVisible();
    await page.getByRole("link", { name: /E2E Event Vendor Payment/ }).click();
    await page.waitForURL(
      /\/vendor-payments\/e2e00000-0000-0000-0000-000000000004/
    );
    await expect(
      page.getByRole("heading", { name: "E2E Event Vendor Payment" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("upcoming events show linked expenses while post-event sections remain unavailable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await navigateToPublicEvent(page, "E2E Upcoming Public Bangalore");

    await expect(
      page.getByText(
        /Post-event updates, photos, and feedback will appear here soon/
      )
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /Updates/ })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /E2E Upcoming Event Reimbursement/ })
    ).toBeVisible();
  });
});
