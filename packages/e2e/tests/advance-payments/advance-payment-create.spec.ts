import { expect, test } from "../../fixtures/test";
import { AdvancePaymentPage } from "../../pages/advance-payment-page";

test.describe("New advance payment form", () => {
  let ap: AdvancePaymentPage;

  test.beforeEach(async ({ page }) => {
    ap = new AdvancePaymentPage(page);
    await ap.navigateToNew();
  });

  test("renders form fields (no Expense Date)", async ({ page }) => {
    await expect(ap.form.getTitleInput()).toBeVisible();
    await expect(ap.form.getCityInput()).toBeVisible();
    // Bank Account renders only after Zero syncs bank account data
    await expect(page.getByText("Bank Account")).toBeVisible({
      timeout: 15_000,
    });

    // Advance payments do NOT have Expense Date
    await expect(page.getByLabel("Expense Date")).toBeHidden();
  });

  test("line items section is present", async ({ page }) => {
    await expect(page.getByText("Line items", { exact: true })).toBeVisible();
    await expect(ap.form.getDescriptionInputs()).toBeVisible();
  });

  test("add line item button works", async () => {
    await ap.form.addLineItem();
    await expect(ap.form.getDescriptionInputs()).toHaveCount(2);
  });

  test("submit and cancel buttons are present", async () => {
    await expect(ap.form.getSubmitButton()).toBeVisible();
    await expect(ap.form.getCancelButton()).toBeVisible();
  });

  test("cancel navigates back to advance payments list", async ({ page }) => {
    await ap.form.cancel();
    await page.waitForURL(/\/advance-payments$/);
  });

  test("shows validation errors on empty submit", async () => {
    await ap.form.submit();

    const errors = ap.form.getFieldErrors();
    await expect(errors.filter({ hasText: "Title is required" })).toBeVisible();
    await expect(errors.filter({ hasText: "City is required" })).toBeVisible();
  });

  test("remove line item button removes a line item", async () => {
    await expect(ap.form.getDescriptionInputs()).toHaveCount(1);
    await ap.form.addLineItem();
    await expect(ap.form.getDescriptionInputs()).toHaveCount(2);
    await ap.form.removeLineItem();
    await expect(ap.form.getDescriptionInputs()).toHaveCount(1);
  });

  test("submits an advance payment successfully", async ({ page }) => {
    await ap.form.fillTitle("E2E Test Advance Payment");
    await ap.form.selectCity("Bangalore");
    await ap.form.selectBankAccount();

    await ap.form.fillLineItem({
      description: "Test advance item",
      amount: "1000",
    });

    await ap.form.submit();

    await page.waitForURL(/\/advance-payments\/[a-z0-9-]+$/, {
      timeout: 10_000,
    });

    await expect(page.getByText("Advance payment submitted")).toBeVisible();
  });
});
