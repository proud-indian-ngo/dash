import type { Page } from "@playwright/test";
import { expect, waitForZeroReady } from "../fixtures/test";

const OVERLAY_SELECTOR = 'div[role="presentation"][data-base-ui-inert]';

async function dismissComboboxOverlay(page: Page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const overlay = page.locator(OVERLAY_SELECTOR);
  if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press("Escape");
  }
  await expect(overlay).toHaveCount(0, { timeout: 10_000 });
}

async function selectOrCreateVendor(page: Page, vendorNamePrefix: string) {
  const vendorTrigger = page.getByRole("combobox", { name: "Vendor" });
  await vendorTrigger.click();
  const firstOption = page.getByRole("option").first();
  const hasOptions = await firstOption
    .isVisible({ timeout: 10_000 })
    .catch(() => false);

  if (hasOptions) {
    await firstOption.click();
    return;
  }

  await dismissComboboxOverlay(page);
  await page.getByRole("button", { name: "Add new vendor" }).click();
  const dialog = page.getByRole("dialog", { name: /vendor/i });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(`${vendorNamePrefix} ${Date.now()}`);
  await dialog
    .getByRole("textbox", { name: "Phone", exact: true })
    .fill("+91-9876543210");
  await dialog
    .getByRole("textbox", { name: "Bank Account Name" })
    .fill("VP Test Account");
  await dialog
    .getByRole("textbox", { name: "Account Number" })
    .fill("1234567890");
  await dialog.getByRole("textbox", { name: "IFSC Code" }).fill("SBIN0001234");
  await dialog.getByRole("button", { name: /Create/i }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  await page.getByRole("combobox", { name: "Vendor" }).click();
  await expect(firstOption).toBeVisible({ timeout: 10_000 });
  await firstOption.click();
}

async function fillLineItemAndSubmit(
  page: Page,
  description: string,
  amount: string
) {
  await page
    .getByRole("combobox", { name: "Category for line item 1" })
    .click();
  await page.getByRole("option").first().click();
  await page.waitForTimeout(300);

  await page.getByLabel("Description for line item 1").fill(description);
  await page.getByLabel("Amount for line item 1").fill(amount);

  await page.getByRole("button", { name: "Submit" }).click();
}

export async function createVendorPayment(
  page: Page,
  titleSuffix: string
): Promise<string> {
  const title = `E2E VP ${titleSuffix} ${Date.now()}`;

  await page.goto("/vendor-payments/new");
  await waitForZeroReady(page);
  await expect(
    page.getByRole("heading", { name: "New Vendor Payment" })
  ).toBeVisible();

  await page.getByLabel("Title").fill(title);
  await selectOrCreateVendor(page, "E2E Vendor");
  await fillLineItemAndSubmit(page, "Test line item", "5000");
  await page.waitForURL(/\/vendor-payments\/[a-z0-9-]+$/, {
    timeout: 15_000,
  });

  return title;
}

export async function createPendingVP(page: Page): Promise<string> {
  await page.goto("/vendor-payments/new");
  await waitForZeroReady(page);
  await expect(
    page.getByRole("heading", { name: "New Vendor Payment" })
  ).toBeVisible();

  const title = `E2E VP Unhappy ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await selectOrCreateVendor(page, "E2E Vendor");
  await fillLineItemAndSubmit(page, "Unhappy path test item", "1000");
  await page.waitForURL(/\/vendor-payments\/[0-9a-f]{8}-/, { timeout: 15_000 });

  const url = page.url();
  const id = url.split("/vendor-payments/")[1];
  return id;
}

export async function createVolunteerVP(
  page: Page,
  titleSuffix: string
): Promise<string> {
  const title = `E2E VP ${titleSuffix} ${Date.now()}`;

  await page.goto("/vendor-payments/new");
  await waitForZeroReady(page);
  await expect(
    page.getByRole("heading", { name: "New Vendor Payment" })
  ).toBeVisible();

  await page.getByLabel("Title").fill(title);
  await selectOrCreateVendor(page, "E2E Vendor Vol");
  await fillLineItemAndSubmit(page, "Vol line item", "1000");
  await page.waitForURL(/\/vendor-payments\/[a-z0-9-]+$/, {
    timeout: 15_000,
  });

  return title;
}
