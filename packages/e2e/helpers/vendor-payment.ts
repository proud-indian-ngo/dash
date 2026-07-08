import type { Page } from "@playwright/test";
import { expect, waitForZeroReady } from "../fixtures/test";
import { clickUntilDialogCloses } from "./dialog-submit";

const OVERLAY_SELECTOR = 'div[role="presentation"][data-base-ui-inert]';
const vendorPaymentDetailUrlPattern =
  /\/vendor-payments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function dismissComboboxOverlay(page: Page) {
  const listbox = page.getByRole("listbox");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const overlay = page.locator(OVERLAY_SELECTOR);
  if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press("Escape");
  }
  await expect(listbox).toBeHidden({ timeout: 10_000 });
  await expect(overlay).toHaveCount(0, { timeout: 10_000 });
}

async function hasSelectedVendor(page: Page): Promise<boolean> {
  const vendorTrigger = page.getByRole("combobox", { name: "Vendor" });
  const value = (await vendorTrigger.textContent())?.trim();
  return Boolean(value && value !== "Select vendor");
}

async function selectFirstVendorOption(page: Page): Promise<boolean> {
  const vendorTrigger = page.getByRole("combobox", { name: "Vendor" });
  const firstOption = page.getByRole("option").first();

  const trySelect = async (attempt: number): Promise<boolean> => {
    if (await hasSelectedVendor(page)) {
      return true;
    }
    await dismissComboboxOverlay(page);
    await vendorTrigger.click();
    if (await firstOption.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await firstOption.click();
      await expect(page.getByRole("listbox")).toBeHidden({ timeout: 10_000 });
      return true;
    }

    await dismissComboboxOverlay(page);
    await waitForZeroReady(page).catch(() => {
      // Form pages may already be ready.
    });
    if (attempt >= 2) {
      return false;
    }
    return trySelect(attempt + 1);
  };

  return await trySelect(0);
}

async function selectOrCreateVendor(page: Page, vendorNamePrefix: string) {
  if (await selectFirstVendorOption(page)) {
    return;
  }

  await dismissComboboxOverlay(page);
  await page.getByRole("button", { name: "Add new vendor" }).click();
  const dialog = page.getByRole("dialog", { name: /vendor/i });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  const uniqueSuffix = Date.now().toString();
  await dialog
    .getByRole("textbox", { exact: true, name: "Name" })
    .fill(`${vendorNamePrefix} ${uniqueSuffix}`);
  await dialog
    .getByRole("textbox", { exact: true, name: "Phone" })
    .fill(`+9198${uniqueSuffix.slice(-8)}`);
  await dialog
    .getByRole("textbox", { name: "Bank Account Name" })
    .fill("VP Test Account");
  await dialog
    .getByRole("textbox", { name: "Account Number" })
    .fill(uniqueSuffix.slice(-10).padStart(10, "1"));
  await dialog.getByRole("textbox", { name: "IFSC Code" }).fill("SBIN0001234");
  await clickUntilDialogCloses(dialog, /Create/i);
  await waitForZeroReady(page);

  if (await hasSelectedVendor(page)) {
    return;
  }
  if (await selectFirstVendorOption(page)) {
    return;
  }
  throw new Error("Could not select a vendor after creating one");
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
  await page.waitForURL(vendorPaymentDetailUrlPattern, {
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
  const [, id] = url.split("/vendor-payments/");
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
  await page.waitForURL(vendorPaymentDetailUrlPattern, {
    timeout: 15_000,
  });

  return title;
}
