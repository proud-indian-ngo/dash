import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

/**
 * The compliance calendar: the seed creates the default calendar's items
 * from today; specs add their own one-off items and close those, so seeded
 * items stay open for other runs.
 */

async function addItem(page: Page, title: string) {
  await page.getByRole("button", { name: "Add item" }).click();
  const dialog = page.getByRole("dialog", { name: "Add an item" });
  await dialog.getByLabel("Title").fill(title);
  const due = new Date();
  due.setDate(due.getDate() + 20);
  await dialog.getByLabel("Due on").fill(due.toISOString().slice(0, 10));
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
    await uploadEvidence(page, evidence);

    await page.goto("/governance/compliance");
    await expect(
      page.getByRole("heading", { name: "Compliance calendar" })
    ).toBeVisible();
    await expect(page.getByText(/^TDS return \(Q\d\)$/).first()).toBeVisible();

    const title = `E2E one-off filing ${stamp}`;
    await addItem(page, title);
    const row = page.locator("[data-testid^='compliance-item-']", {
      hasText: title,
    });
    await row.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: "Mark done" }).click();
    const dialog = page.getByRole("dialog", { name: "Mark done" });
    await expect(
      dialog.getByRole("button", { name: "Mark done" })
    ).toBeDisabled();
    await dialog.getByLabel("Evidence").click();
    await page.getByRole("option", { name: new RegExp(evidence) }).click();
    await dialog.getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByText("Marked done")).toBeVisible();

    await page.getByRole("button", { exact: true, name: "Closed" }).click();
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
    await dialog.getByRole("button", { name: "Not needed" }).click();
    await page.getByRole("button", { exact: true, name: "Closed" }).click();
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
