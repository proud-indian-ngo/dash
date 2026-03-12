import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("New reimbursement form", () => {
  let reimbursement: ReimbursementPage;

  test.beforeEach(async ({ page }) => {
    reimbursement = new ReimbursementPage(page);
    await reimbursement.navigateToNew();
  });

  test("renders all form fields", async ({ page }) => {
    await expect(reimbursement.form.getTitleInput()).toBeVisible();
    await expect(reimbursement.form.getCityInput()).toBeVisible();
    await expect(page.getByLabel("Expense Date")).toBeVisible();
    // Bank Account renders only after Zero syncs bank account data
    await expect(page.getByText("Bank Account")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("line items section is present", async ({ page }) => {
    await expect(page.getByText("Line items", { exact: true })).toBeVisible();
    await expect(reimbursement.form.getDescriptionInputs()).toBeVisible();
  });

  test("add line item button works", async () => {
    await reimbursement.form.addLineItem();
    await expect(reimbursement.form.getDescriptionInputs()).toHaveCount(2);
  });

  test("submit and cancel buttons are present", async () => {
    await expect(reimbursement.form.getSubmitButton()).toBeVisible();
    await expect(reimbursement.form.getCancelButton()).toBeVisible();
  });

  test("cancel navigates back to reimbursements list", async ({ page }) => {
    await reimbursement.form.cancel();
    await page.waitForURL(/\/reimbursements$/);
  });

  test("shows validation errors on empty submit", async () => {
    await reimbursement.form.submit();

    const errors = reimbursement.form.getFieldErrors();
    await expect(errors.filter({ hasText: "Title is required" })).toBeVisible();
    await expect(errors.filter({ hasText: "City is required" })).toBeVisible();
    await expect(
      errors.filter({ hasText: "Expense date is required" })
    ).toBeVisible();
  });

  test("remove line item button removes a line item", async () => {
    await expect(reimbursement.form.getDescriptionInputs()).toHaveCount(1);
    await reimbursement.form.addLineItem();
    await expect(reimbursement.form.getDescriptionInputs()).toHaveCount(2);
    await reimbursement.form.removeLineItem();
    await expect(reimbursement.form.getDescriptionInputs()).toHaveCount(1);
  });

  test("submits a reimbursement successfully", async ({ page }) => {
    await reimbursement.form.fillTitle("E2E Test Reimbursement");
    await reimbursement.form.selectCity("Bangalore");

    // Wait for Zero data (bank accounts) to sync, then select BEFORE date picker
    await reimbursement.form.selectBankAccount();

    // Select Expense Date — pick today (do this last to avoid popover interference)
    await reimbursement.selectExpenseDate();

    // Fill line item
    await reimbursement.form.fillLineItem({
      description: "Test expense item",
      amount: "500",
    });

    await reimbursement.form.submit();

    // Should redirect to the reimbursement detail page
    await page.waitForURL(/\/reimbursements\/[a-z0-9-]+$/, { timeout: 10_000 });

    // Verify success toast
    await expect(page.getByText("Reimbursement submitted")).toBeVisible();
  });
});
