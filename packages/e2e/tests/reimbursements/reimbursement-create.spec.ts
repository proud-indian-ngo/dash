import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("New reimbursement form", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(async ({ page }) => {
    reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.navigateToNew();
  });

  test("renders all form fields including Expense Date", async ({ page }) => {
    await expect(reimbursements.form.getTitleInput()).toBeVisible();
    await expect(reimbursements.form.getCityInput()).toBeVisible();
    await expect(page.getByLabel("Expense Date")).toBeVisible();
    await expect(page.getByText("Bank Account")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("line items section is present", async ({ page }) => {
    await expect(page.getByText("Line items", { exact: true })).toBeVisible();
    await expect(reimbursements.form.getDescriptionInputs()).toBeVisible();
  });

  test("add line item button works", async () => {
    await reimbursements.form.addLineItem();
    await expect(reimbursements.form.getDescriptionInputs()).toHaveCount(2);
  });

  test("submit and cancel buttons are present", async () => {
    await expect(reimbursements.form.getSubmitButton()).toBeVisible();
    await expect(reimbursements.form.getCancelButton()).toBeVisible();
  });

  test("cancel navigates back to reimbursements list", async ({ page }) => {
    await reimbursements.form.cancel();
    await page.waitForURL(/\/reimbursements$/);
  });

  test("shows validation errors on empty submit", async () => {
    await reimbursements.form.submit();

    const errors = reimbursements.form.getFieldErrors();
    await expect(errors.filter({ hasText: "Title is required" })).toBeVisible();
    await expect(errors.filter({ hasText: "City is required" })).toBeVisible();
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
    await reimbursements.form.fillTitle("E2E Test Reimbursement");
    await reimbursements.form.selectCity("Bangalore");
    await reimbursements.form.selectBankAccount();
    await reimbursements.selectExpenseDate();

    await reimbursements.form.fillLineItem({
      description: "Test expense item",
      amount: "500",
    });

    await reimbursements.form.submit();

    await page.waitForURL(/\/reimbursements\/[a-z0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByText("Reimbursement submitted")).toBeVisible();
  });
});
