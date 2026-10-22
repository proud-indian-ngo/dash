import { expect, test } from "../../fixtures/test";
import { chargeRequestTo } from "../../helpers/request-event";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("New reimbursement form", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(async ({ page }) => {
    reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.navigateToNew();
  });

  test("cancel navigates back to reimbursements list", async ({ page }) => {
    await reimbursements.form.cancel();
    await page.waitForURL(/\/reimbursements$/);
  });

  test("shows validation errors on empty submit", async () => {
    await reimbursements.form.submit();

    const errors = reimbursements.form.getFieldErrors();
    await expect(errors.filter({ hasText: "Title is required" })).toBeVisible();
    await expect(
      errors.filter({ hasText: "Expense date is required" })
    ).toBeVisible();
  });

  test("remove line item button removes a line item", async () => {
    await expect(reimbursements.form.getDescriptionInputs()).toHaveCount(1);
    await reimbursements.form.addLineItem();
    await expect(reimbursements.form.getDescriptionInputs()).toHaveCount(2);
    await reimbursements.form.removeLineItem();
    await expect(reimbursements.form.getDescriptionInputs()).toHaveCount(1);
  });

  test("submits a reimbursement successfully", async ({ page }) => {
    await reimbursements.form.selectBankAccount();
    await reimbursements.form.fillTitle("E2E Test Reimbursement");
    await reimbursements.form.selectCity("Bangalore");
    await chargeRequestTo(page, "Organisation (admin)");
    await reimbursements.selectExpenseDate();

    await reimbursements.form.fillLineItem({
      amount: "500",
      description: "Test expense item",
    });

    await reimbursements.form.submit();

    await page.waitForURL(
      /\/reimbursements\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      { timeout: 10_000 }
    );
    await expect(page.getByText("Reimbursement submitted")).toBeVisible();
  });
});
