import { currentFinancialYear } from "@pi-dash/shared/income";
import { strFromU8, unzipSync } from "fflate";

import { expect, test } from "../../fixtures/test";
import {
  createVendorPayment,
  createVolunteerVP,
  handOverVendorPayment,
} from "../../helpers/vendor-payment";

test.describe("Vendor payment workflow (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  /** Assert the VP status badge shows the expected text. */
  async function expectStatus(
    page: import("@playwright/test").Page,
    status: string
  ) {
    await expect(
      page
        .locator('[data-slot="status-badge"]')
        .getByText(status, { exact: true })
    ).toBeVisible({ timeout: 10_000 });
  }

  /** Click Approve in the approve alertdialog and wait for it to close. */
  async function approveInDialog(page: import("@playwright/test").Page) {
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByRole("button", { name: "Approve" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }

  /** Click Reject in the reject alertdialog and wait for it to close. */
  async function rejectInDialog(
    page: import("@playwright/test").Page,
    reason: string
  ) {
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByRole("textbox", { name: "Reason" }).fill(reason);
    await dialog.getByRole("button", { name: "Reject" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }

  test("full payment workflow: approve → record payments → upload invoice → approve invoice", async ({
    page,
  }) => {
    test.slow();
    await createVendorPayment(page, "Full");
    await handOverVendorPayment(page);

    // Payments wait for approval
    await expect(
      page.getByText("Payments can be recorded after this request is approved.")
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Record payment" })
    ).toHaveCount(0);

    // Step 1: Approve VP
    await page.getByRole("button", { name: "Approve" }).first().click();
    await approveInDialog(page);
    await expectStatus(page, "Approved");

    // Step 2: Record partial payment (auto-approved as admin)
    await page.getByRole("button", { name: "Record payment" }).click();
    const recordDialog = page.getByRole("dialog", { name: /payment/i });
    await expect(recordDialog).toBeVisible({ timeout: 5000 });
    await recordDialog.getByLabel("Amount").fill("3000");
    await recordDialog.getByLabel("Description").fill("Partial payment");
    await recordDialog.getByRole("button", { name: "Record payment" }).click();
    await expect(recordDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Partially Paid");

    // Step 3: Record remaining payment
    await page.getByRole("button", { name: "Record payment" }).click();
    const recordDialog2 = page.getByRole("dialog", { name: /payment/i });
    await expect(recordDialog2).toBeVisible({ timeout: 5000 });
    await recordDialog2.getByLabel("Amount").fill("2000");
    await recordDialog2.getByLabel("Description").fill("Final payment");
    await recordDialog2.getByRole("button", { name: "Record payment" }).click();
    await expect(recordDialog2).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Paid");
    // Review is over once the request is approved
    await expect(
      page.getByRole("button", { exact: true, name: "Approve" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { exact: true, name: "Reject" })
    ).toHaveCount(0);

    // Step 4: Upload invoice
    await page.getByRole("button", { name: "Add invoice or reason" }).click();
    const invoiceDialog = page.getByRole("dialog", {
      name: "Add invoice or reason",
    });
    await expect(invoiceDialog).toBeVisible({ timeout: 5000 });
    await expect(
      invoiceDialog.getByText("Do you have an invoice?")
    ).toBeVisible();
    await expect(
      invoiceDialog.getByRole("button", { name: "Yes, upload invoice" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      invoiceDialog.getByRole("button", { name: "No invoice" })
    ).toBeVisible();
    await invoiceDialog.getByLabel("Invoice Number").fill("INV-E2E-001");
    await invoiceDialog.getByLabel("Invoice Date").click();
    await page.getByRole("gridcell", { name: "15" }).first().click();
    await invoiceDialog
      .getByPlaceholder("Paste URL and press Enter")
      .fill("https://example.com/invoice-e2e.pdf");
    await invoiceDialog
      .getByRole("button", { exact: true, name: "Add" })
      .click();
    await invoiceDialog.getByRole("button", { name: "Submit invoice" }).click();
    await expect(invoiceDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Invoice Pending");

    // Step 5: Approve invoice
    await page.getByRole("button", { name: "Approve invoice" }).click();
    await approveInDialog(page);
    await expectStatus(page, "Completed");
  });

  test("rent paid without an invoice: proof → approve → completed", async ({
    page,
  }) => {
    test.slow();
    const title = await createVendorPayment(page, "NoInvoice");
    await handOverVendorPayment(page);
    const fyStart = currentFinancialYear().startsOn.slice(0, 4);
    const transactionDate = new Date();
    transactionDate.setDate(10);
    const expectedExportDate = [
      transactionDate.getFullYear(),
      String(transactionDate.getMonth() + 1).padStart(2, "0"),
      "10",
    ].join("-");

    // Approve VP
    await page.getByRole("button", { name: "Approve" }).first().click();
    await approveInDialog(page);
    await expectStatus(page, "Approved");

    // Record full payment
    await page.getByRole("button", { name: "Record payment" }).click();
    const recordDialog = page.getByRole("dialog", { name: /payment/i });
    await expect(recordDialog).toBeVisible({ timeout: 5000 });
    await recordDialog.getByLabel("Amount").fill("5000");
    await recordDialog.getByLabel("Transaction date").click();
    // The calendar remounts its days whenever the page re-renders (a Zero
    // update, say), so a click can land on a replaced button and be lost;
    // the picker then stays open. Retry until the pick closes it.
    const tenth = page.getByRole("button", { name: / 10th, / });
    await expect(async () => {
      await tenth.click({ timeout: 1000 });
      await expect(tenth).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    await expect(recordDialog.getByLabel("Transaction date")).toHaveText(
      /^10 /
    );
    const transactionDateLabel = await recordDialog
      .getByLabel("Transaction date")
      .textContent();
    if (!transactionDateLabel) {
      throw new Error("Missing transaction date label");
    }
    await recordDialog.getByRole("button", { name: "Record payment" }).click();
    await expect(recordDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Paid");

    // Close it without an invoice: rent, with a receipt as proof
    await page.getByRole("button", { name: "Add invoice or reason" }).click();
    const invoiceDialog = page.getByRole("dialog", {
      name: "Add invoice or reason",
    });
    await expect(invoiceDialog).toBeVisible({ timeout: 5000 });
    await invoiceDialog.getByRole("button", { name: "No invoice" }).click();
    await expect(
      invoiceDialog.getByLabel("Receipt or challan date")
    ).toHaveText(transactionDateLabel);
    await invoiceDialog.getByLabel("Reason").click();
    await page
      .getByRole("option", { exact: true, name: "Rent / lease" })
      .click();
    await expect(invoiceDialog.getByLabel("Note (optional)")).toBeVisible();

    await invoiceDialog
      .getByPlaceholder("Paste URL and press Enter")
      .fill("https://example.com/rent-receipt.pdf");
    await invoiceDialog
      .getByRole("button", { exact: true, name: "Add" })
      .click();
    await invoiceDialog
      .getByRole("button", { name: "Submit for review" })
      .click();
    await expect(invoiceDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Invoice Pending");
    await expect(page.getByText("No invoice — Rent / lease")).toBeVisible();

    // Approve it
    await page
      .getByRole("button", { exact: true, name: "Approve without invoice" })
      .click();
    await approveInDialog(page);
    await expect(
      page.getByText("Closed without invoice", { exact: true })
    ).toBeVisible();
    await expectStatus(page, "Completed");
    await expect(page.getByText("No invoice — Rent / lease")).toBeVisible();

    await page.getByRole("button", { name: "Edit details" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit details" });
    await expect(editDialog).toBeVisible({ timeout: 5000 });
    await expect(editDialog.getByLabel("Receipt or challan date")).toHaveText(
      transactionDateLabel
    );
    await editDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(editDialog).toBeHidden({ timeout: 5000 });

    // The document date places both invoice kinds in the financial year and is
    // exported in the Invoice Date column.
    const params = new URLSearchParams({
      fyStart,
      includeTransactions: "false",
      includeVendorPayments: "true",
      vendorPaymentStatus: "completed",
    });
    const response = await page.request.get(`/api/financial-export?${params}`);
    expect(response.ok()).toBe(true);
    const archive = unzipSync(await response.body());
    const csv = Object.entries(archive).find(([name]) =>
      name.startsWith("vendor-payments_")
    )?.[1];
    if (!csv) {
      throw new Error("Missing vendor payments CSV");
    }
    const [headerLine, ...rows] = strFromU8(csv).split("\n");
    const headers = headerLine?.split(",") ?? [];
    const row = rows.find((line) => line.startsWith(`${title},`));
    expect(row).toBeDefined();
    const cells = row?.split(",") ?? [];
    expect(cells[headers.indexOf("Invoice Number")]).toBe(
      "No invoice — Rent / lease"
    );
    expect(cells[headers.indexOf("Invoice Date")]).toBe(expectedExportDate);
  });

  test("no-invoice reason rejection and resubmission", async ({ page }) => {
    test.slow();
    await createVendorPayment(page, "NoInvoiceReject");
    await handOverVendorPayment(page);

    await page.getByRole("button", { name: "Approve" }).first().click();
    await approveInDialog(page);
    await expectStatus(page, "Approved");

    await page.getByRole("button", { name: "Record payment" }).click();
    const recordDialog = page.getByRole("dialog", { name: /payment/i });
    await expect(recordDialog).toBeVisible({ timeout: 5000 });
    await recordDialog.getByLabel("Amount").fill("5000");
    await recordDialog.getByRole("button", { name: "Record payment" }).click();
    await expect(recordDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Paid");

    await page.getByRole("button", { name: "Add invoice or reason" }).click();
    const invoiceDialog = page.getByRole("dialog", {
      name: "Add invoice or reason",
    });
    await expect(invoiceDialog).toBeVisible({ timeout: 5000 });
    await invoiceDialog.getByRole("button", { name: "No invoice" }).click();
    await invoiceDialog.getByLabel("Reason").click();
    await page
      .getByRole("option", { exact: true, name: "Rent / lease" })
      .click();
    await invoiceDialog
      .getByRole("button", { name: "Submit for review" })
      .click();
    await expect(invoiceDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Invoice Pending");

    await page
      .getByRole("button", { exact: true, name: "Reject reason" })
      .click();
    const rejectDialog = page.getByRole("alertdialog", {
      name: "Reject reason?",
    });
    await expect(rejectDialog).toBeVisible({ timeout: 5000 });
    await rejectDialog
      .getByRole("textbox", { name: "Reason" })
      .fill("Use the specific exception reason");
    await rejectDialog.getByRole("button", { name: "Reject" }).click();
    await expect(rejectDialog).toBeHidden({ timeout: 10_000 });
    await expect(
      page.getByText("Reason rejected", { exact: true })
    ).toBeVisible();
    await expectStatus(page, "Paid");

    await page.getByRole("button", { name: "Resubmit" }).click();
    const resubmitDialog = page.getByRole("dialog", {
      name: "Add invoice or reason",
    });
    await expect(resubmitDialog).toBeVisible({ timeout: 5000 });
    await resubmitDialog.getByLabel("Reason").click();
    await page.getByRole("option", { exact: true, name: "Other" }).click();
    await expect(resubmitDialog.getByLabel("Date")).not.toHaveText(
      "Pick a date"
    );
    const note = resubmitDialog.getByRole("textbox", {
      exact: true,
      name: "Note",
    });
    await expect(note).toHaveAttribute("aria-required", "true");
    await note.fill("The landlord does not issue an invoice");
    await resubmitDialog
      .getByRole("button", { name: "Submit for review" })
      .click();
    await expect(resubmitDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Invoice Pending");

    await page
      .getByRole("button", { exact: true, name: "Approve without invoice" })
      .click();
    await approveInDialog(page);
    await expect(
      page.getByText("Closed without invoice", { exact: true })
    ).toBeVisible();
    await expectStatus(page, "Completed");
    await expect(page.getByText("No invoice — Other")).toBeVisible();
    await expect(
      page.getByText("The landlord does not issue an invoice")
    ).toBeVisible();
  });

  test("invoice rejection and resubmission flow", async ({ page }) => {
    test.slow();
    await createVendorPayment(page, "InvReject");
    await handOverVendorPayment(page);

    // Approve VP
    await page.getByRole("button", { name: "Approve" }).first().click();
    await approveInDialog(page);
    await expectStatus(page, "Approved");

    // Record full payment
    await page.getByRole("button", { name: "Record payment" }).click();
    const recordDialog = page.getByRole("dialog", { name: /payment/i });
    await expect(recordDialog).toBeVisible({ timeout: 5000 });
    await recordDialog.getByLabel("Amount").fill("5000");
    await recordDialog.getByRole("button", { name: "Record payment" }).click();
    await expect(recordDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Paid");

    // Upload invoice
    await page.getByRole("button", { name: "Add invoice or reason" }).click();
    const invoiceDialog = page.getByRole("dialog", {
      name: "Add invoice or reason",
    });
    await expect(invoiceDialog).toBeVisible({ timeout: 5000 });
    await invoiceDialog.getByLabel("Invoice Number").fill("INV-BAD-001");
    await invoiceDialog.getByLabel("Invoice Date").click();
    await page.getByRole("gridcell", { name: "15" }).first().click();
    await invoiceDialog
      .getByPlaceholder("Paste URL and press Enter")
      .fill("https://example.com/wrong-invoice.pdf");
    await invoiceDialog
      .getByRole("button", { exact: true, name: "Add" })
      .click();
    await invoiceDialog.getByRole("button", { name: "Submit invoice" }).click();
    await expect(invoiceDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Invoice Pending");

    // Reject invoice
    await page.getByRole("button", { name: "Reject invoice" }).click();
    await rejectInDialog(page, "Wrong invoice number format");

    await expectStatus(page, "Paid");
    await expect(
      page.getByText("Wrong invoice number format").first()
    ).toBeVisible();

    // Re-upload corrected invoice
    await page.getByRole("button", { name: "Resubmit invoice" }).click();
    const editDialog = page.getByRole("dialog", {
      name: "Add invoice or reason",
    });
    await expect(editDialog).toBeVisible({ timeout: 5000 });
    await expect(editDialog.getByLabel("Invoice Number")).toHaveValue(
      "INV-BAD-001",
      { timeout: 5000 }
    );
    await editDialog.getByLabel("Invoice Number").clear();
    await editDialog.getByLabel("Invoice Number").fill("INV-GOOD-001");
    await editDialog.getByRole("button", { name: "Submit invoice" }).click();
    await expect(editDialog).toBeHidden({ timeout: 15_000 });
    await expectStatus(page, "Invoice Pending");

    // Approve corrected invoice
    await page.getByRole("button", { name: "Approve invoice" }).click();
    await approveInDialog(page);
    await expectStatus(page, "Completed");
  });
});

test.describe("Vendor payment workflow (volunteer)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("volunteer can create VP and reopen the edit form", async ({ page }) => {
    test.slow();

    const title = await createVolunteerVP(page, "Volunteer");

    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    // Payments wait for approval
    await expect(
      page.getByText("Payments can be recorded after this request is approved.")
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Request payment" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Record payment" })
    ).toHaveCount(0);

    await page.getByRole("button", { exact: true, name: "Edit" }).click();

    await expect(
      page.getByRole("heading", { name: "Edit vendor payment" })
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(
      title
    );
  });
});
