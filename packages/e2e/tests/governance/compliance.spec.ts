import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

/**
 * The compliance calendar: the seed creates the default calendar's items
 * from today; specs add their own one-off items and close those, so seeded
 * items stay open for other runs.
 */

/** Picks a day in a DateField; its calendar closes itself on selection. */
async function pickDay(scope: Locator, label: string, date: Date) {
  const page = scope.page();
  await scope.getByRole("button", { exact: true, name: label }).click();
  const popup = page.getByRole("dialog").last();
  const day = popup.locator(
    `button[data-day="${date.toLocaleDateString("en-US")}"]`
  );
  for (let month = 0; month < 24 && !(await day.isVisible()); month++) {
    await popup.getByRole("button", { name: /next month/i }).click();
  }
  await day.click();
  await expect(day).toBeHidden();
}

async function addItem(page: Page, title: string) {
  await page.getByRole("button", { name: "Add item" }).click();
  const dialog = page.getByRole("dialog", { name: "Add an item" });
  await dialog.getByLabel("Title").fill(title);
  const due = new Date();
  due.setDate(due.getDate() + 20);
  await pickDay(dialog, "Due on", due);
  await dialog.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

async function uploadEvidence(page: Page, title: string) {
  await page.goto("/governance/documents");
  await page.getByRole("button", { name: "Add document" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a document" });
  await dialog.getByLabel("File").setInputFiles({
    buffer: Buffer.from(`%PDF-1.4\n% ${title}\n1 0 obj\n<<>>\nendobj\n%%EOF`),
    mimeType: "application/pdf",
    name: "acknowledgement.pdf",
  });
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  await dialog.getByRole("button", { exact: true, name: "Dated" }).click();
  const today = new Date();
  await page
    .getByRole("dialog")
    .last()
    .locator(`button[data-day="${today.toLocaleDateString("en-US")}"]`)
    .click();
  await dialog.getByRole("button", { name: "Add to vault" }).click();
  await expect(page.getByText("Added to the vault")).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("compliance calendar (super admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
  });

  test("shows the seeded calendar and closes an item only with evidence", async ({
    page,
  }) => {
    test.slow();
    const stamp = Date.now();
    const evidence = `E2E filing acknowledgement ${stamp}`;
    // Uploading evidence needs R2, which CI does not have: there the test
    // checks the calendar and the refusal without evidence only.
    if (!process.env.CI) {
      await uploadEvidence(page, evidence);
    }

    await page.goto("/governance/compliance");
    await expect(
      page.getByRole("heading", { name: "Compliance calendar" })
    ).toBeVisible();
    // The seeded calendar runs 400 days ahead, so later months always hold
    // items, folded by month until opened.
    const later = page.getByRole("region", { name: "Later" });
    await later.getByRole("button").first().click();
    await expect(
      later.locator("[data-testid^='compliance-item-']").first()
    ).toBeVisible();

    const title = `E2E one-off filing ${stamp}`;
    await addItem(page, title);
    const row = page.locator("[data-testid^='compliance-item-']", {
      hasText: title,
    });
    await row.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: "Mark done" }).click();
    const dialog = page.getByRole("dialog", { name: "Mark done" });
    // An item closes only with the document that proves it.
    await dialog.getByRole("button", { name: "Mark done" }).click();
    await expect(
      page.getByText("Choose the document that proves it.")
    ).toBeVisible();
    if (process.env.CI) {
      return;
    }
    await dialog.getByLabel("Evidence").click();
    await page.getByRole("option", { name: new RegExp(evidence) }).click();
    await dialog.getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByText("Marked done")).toBeVisible();

    await page.getByRole("tab", { name: /^Closed/ }).click();
    const closed = page.locator("[data-testid^='compliance-item-']", {
      hasText: title,
    });
    await expect(closed).toContainText("Done");
    await expect(closed.getByRole("link", { name: evidence })).toBeVisible();
  });

  test("records an item as not needed, with the reason", async ({ page }) => {
    await page.goto("/governance/compliance");
    const title = `E2E waived item ${Date.now()}`;
    await addItem(page, title);
    const row = page.locator("[data-testid^='compliance-item-']", {
      hasText: title,
    });
    await row.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: "Not needed" }).click();
    const dialog = page.getByRole("dialog", { name: "Not needed this time" });
    await dialog.getByLabel("Reason").fill("Filed by the CA directly.");
    await dialog.getByRole("button", { name: "Mark not needed" }).click();
    await page.getByRole("tab", { name: /^Closed/ }).click();
    await expect(
      page.locator("[data-testid^='compliance-item-']", { hasText: title })
    ).toContainText("Filed by the CA directly.");
  });
});

test.describe("compliance calendar access", () => {
  test("is read-only for finance admins", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    await page.goto("/governance/compliance");
    await expect(
      page.getByRole("heading", { name: "Compliance calendar" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add item" })).toBeHidden();
  });
});
