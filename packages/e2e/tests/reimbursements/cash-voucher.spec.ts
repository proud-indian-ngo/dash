import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Cash voucher", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(({ page }) => {
    reimbursements = new ReimbursementPage(page, "reimbursement");
  });

  test("shows cash voucher checkbox for line item ≤ 1000", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursements.navigateToNew();

    await reimbursements.form.fillLineItem({
      description: "Small expense",
      amount: "500",
    });

    await expect(page.getByText("Generate cash voucher")).toBeVisible();
  });

  test("hides cash voucher checkbox for line item > 1000", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursements.navigateToNew();

    await reimbursements.form.fillLineItem({
      description: "Large expense",
      amount: "1500",
    });

    await expect(page.getByText("Generate cash voucher")).toBeHidden();
  });

  test("toggles cash voucher checkbox when amount crosses threshold", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursements.navigateToNew();

    await reimbursements.form.fillLineItem({
      description: "Test item",
      amount: "500",
    });
    await expect(page.getByText("Generate cash voucher")).toBeVisible();

    await reimbursements.form.getAmountInputs().last().fill("1500");
    await expect(page.getByText("Generate cash voucher")).toBeHidden();

    await reimbursements.form.getAmountInputs().last().fill("800");
    await expect(page.getByText("Generate cash voucher")).toBeVisible();
  });

  test("submits reimbursement with cash voucher opt-in", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursements.createReimbursementWithVoucher("Voucher Submit");

    await expect(page.getByText("Reimbursement submitted")).toBeVisible();
  });

  test("approval enqueues voucher for opted-in line item", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    test.slow();

    await reimbursements.createReimbursementWithVoucher("Voucher Approval");

    await expect(reimbursements.detail.getApproveButton()).toBeVisible();
    await reimbursements.detail.approve();

    await expect(page.getByText("Reimbursement approved")).toBeVisible();

    // After approval, the voucher column should appear with a pending/generated state
    await expect(
      page.getByRole("columnheader", { name: "Voucher" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("admin can trigger voucher generation for qualifying line item", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    test.slow();

    await reimbursements.createReimbursement("No Voucher");

    await expect(reimbursements.detail.getApproveButton()).toBeVisible();
    await reimbursements.detail.approve();

    await expect(page.getByText("Reimbursement approved")).toBeVisible();

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

  test("shows voucher column only for approved reimbursements", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

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
