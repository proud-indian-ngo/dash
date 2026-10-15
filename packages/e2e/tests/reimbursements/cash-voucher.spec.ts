import type { Locator } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";
import { ReimbursementPage } from "../../pages/reimbursement-page";

async function setVoucherLimit(main: Locator, rupees: string) {
  await main.getByRole("button", { name: "Edit cash voucher limit" }).click();
  await main.getByLabel("Cash voucher limit (₹)").fill(rupees);
  await main.getByRole("button", { name: "Save limit" }).click();
}

test.describe("Cash voucher", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(({ page }) => {
    reimbursements = new ReimbursementPage(page, "reimbursement");
  });

  test("shows cash voucher checkbox for line item ≤ 1000", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await reimbursements.navigateToNew();

    await reimbursements.form.fillLineItem({
      amount: "500",
      description: "Small expense",
      selectCategory: false,
    });

    await expect(page.getByText("Generate cash voucher")).toBeVisible();
  });

  test("hides cash voucher checkbox for line item over the limit", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await reimbursements.navigateToNew();

    await reimbursements.form.fillLineItem({
      amount: "15000",
      description: "Large expense",
      selectCategory: false,
    });

    await expect(page.getByText("Generate cash voucher")).toBeHidden();
  });

  test("toggles cash voucher checkbox when amount crosses threshold", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await reimbursements.navigateToNew();

    await reimbursements.form.fillLineItem({
      amount: "500",
      description: "Test item",
      selectCategory: false,
    });
    await expect(page.getByText("Generate cash voucher")).toBeVisible();

    await reimbursements.form.getAmountInputs().last().fill("15000");
    await expect(page.getByText("Generate cash voucher")).toBeHidden();

    await reimbursements.form.getAmountInputs().last().fill("800");
    await expect(page.getByText("Generate cash voucher")).toBeVisible();
  });

  test("submits reimbursement with cash voucher opt-in", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await reimbursements.createReimbursementWithVoucher("Voucher Submit");

    await expect(page.getByText("Reimbursement submitted")).toBeVisible();
  });

  test("approval enqueues voucher for opted-in line item", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    test.skip(
      Boolean(process.env.CI),
      "Approving promotes the payment screenshot in R2, which CI does not have"
    );
    test.slow();

    await reimbursements.createReimbursementWithVoucher("Voucher Approval");

    await expect(reimbursements.detail.getApproveButton()).toBeVisible();
    await reimbursements.detail.approve();

    await expect(page.getByText("Reimbursement approved")).toBeVisible({
      timeout: 15_000,
    });

    // After approval, the voucher column should appear with a pending/generated state
    await expect(
      page.getByRole("columnheader", { name: "Voucher" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("admin can trigger voucher generation for qualifying line item", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    test.slow();

    await reimbursements.createReimbursement("No Voucher");
    await reimbursements.approveInDatabase();

    // Since createReimbursement uses amount "100" (≤ 1000) without opt-in,
    // the "Generate Voucher" button should appear for the qualifying line item
    await expect(reimbursements.detail.getGenerateVoucherButton()).toBeVisible({
      timeout: 10_000,
    });

    await reimbursements.detail.getGenerateVoucherButton().click();

    await expect(page.getByText("Voucher generation started")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("names the payee on a voucher line item", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await reimbursements.createReimbursementWithVoucher("Voucher Payee");

    await expect(page.getByText("Paid to Test Payee")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("requires the payee's name once the voucher is ticked", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await reimbursements.navigateToNew();
    await reimbursements.form.fillLineItem({
      amount: "500",
      description: "Daily-wage labour",
      selectCategory: false,
    });
    await reimbursements.form.toggleCashVoucher(0);
    await expect(reimbursements.form.getPayeeNameInput(0)).toBeVisible();
    await reimbursements.form.submit();

    await expect(page.getByText("Name who was paid")).toBeVisible();
  });

  test("an admin's edit of an approved request keeps its voucher", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    test.skip(
      Boolean(process.env.CI),
      "Generating a voucher and keeping it on edit need R2, which CI does not have"
    );
    test.slow();

    await reimbursements.createReimbursement("Voucher Edit");
    await reimbursements.approveInDatabase();
    await reimbursements.detail.getGenerateVoucherButton().click();
    await expect(
      reimbursements.detail.getVoucherGeneratedIndicator()
    ).toBeVisible({ timeout: 60_000 });

    await reimbursements.detail.editSubmission();
    const editedTitle = `E2E Voucher Edited ${Date.now()}`;
    await reimbursements.form.getTitleInput().clear();
    await reimbursements.form.fillTitle(editedTitle);
    await reimbursements.form.submit();

    await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      reimbursements.detail.getVoucherGeneratedIndicator()
    ).toBeVisible({ timeout: 10_000 });
    await expect(reimbursements.detail.getGenerateVoucherButton()).toBeHidden();
  });

  test("shows voucher column only for approved reimbursements", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    const pendingRow = reimbursements.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.click();

    await expect(
      page.getByRole("columnheader", { name: "Voucher" })
    ).toBeHidden();
  });
});

test.describe("Cash voucher limit", () => {
  // Both tests change the shared limit; run them one after the other.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("a ₹2,000 limit lets a ₹2,000 item without a bill get a voucher", async ({
    page,
  }) => {
    test.slow();
    const reimbursements = new ReimbursementPage(page, "reimbursement");
    const main = await openSettingsPage(
      page,
      "/settings/programmes",
      "Programmes"
    );
    try {
      await setVoucherLimit(main, "2000");
      await expect(page.getByText("Voucher limit updated")).toBeVisible();
      await expect(main.getByText("Limit: ₹2,000")).toBeVisible({
        timeout: 10_000,
      });

      await reimbursements.navigateToNew();
      await reimbursements.form.fillLineItem({
        amount: "2000",
        description: "Daily-wage labour",
        selectCategory: false,
      });
      await expect(page.getByText("Generate cash voucher")).toBeVisible();

      await reimbursements.createReimbursement(
        "Voucher Limit",
        undefined,
        "2000"
      );
      await reimbursements.approveInDatabase();
      await expect(
        reimbursements.detail.getGenerateVoucherButton()
      ).toBeVisible({ timeout: 10_000 });
      await reimbursements.detail.getGenerateVoucherButton().click();
      await expect(page.getByText("Voucher generation started")).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      const settings = await openSettingsPage(
        page,
        "/settings/programmes",
        "Programmes"
      );
      await setVoucherLimit(settings, "1000");
      await expect(settings.getByText("Limit: ₹1,000")).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("refuses a limit above ₹10,000", async ({ page }) => {
    const main = await openSettingsPage(
      page,
      "/settings/programmes",
      "Programmes"
    );
    await main.getByRole("button", { name: "Edit cash voucher limit" }).click();
    const input = main.getByLabel("Cash voucher limit (₹)");
    await input.fill("10001");
    await input.blur();
    await expect(
      main.getByText("The voucher limit must be between ₹1 and ₹10,000")
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: "Save limit" })
    ).toBeDisabled();
    await main.getByRole("button", { name: "Cancel" }).click();
    await expect(main.getByText("Limit: ₹1,000")).toBeVisible();
  });
});
