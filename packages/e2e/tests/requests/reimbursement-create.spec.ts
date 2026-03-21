import { expect, test } from "../../fixtures/test";
import { RequestPage } from "../../pages/request-page";

test.describe("New reimbursement request form", () => {
  let requests: RequestPage;

  test.beforeEach(async ({ page }) => {
    requests = new RequestPage(page, "reimbursement");
    await requests.navigateToNew();
    await requests.selectType("reimbursement");
  });

  test("renders all form fields including Expense Date", async ({ page }) => {
    await expect(requests.form.getTitleInput()).toBeVisible();
    await expect(requests.form.getCityInput()).toBeVisible();
    await expect(page.getByLabel("Expense Date")).toBeVisible();
    await expect(page.getByText("Bank Account")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("line items section is present", async ({ page }) => {
    await expect(page.getByText("Line items", { exact: true })).toBeVisible();
    await expect(requests.form.getDescriptionInputs()).toBeVisible();
  });

  test("add line item button works", async () => {
    await requests.form.addLineItem();
    await expect(requests.form.getDescriptionInputs()).toHaveCount(2);
  });

  test("submit and cancel buttons are present", async () => {
    await expect(requests.form.getSubmitButton()).toBeVisible();
    await expect(requests.form.getCancelButton()).toBeVisible();
  });

  test("cancel navigates back to requests list", async ({ page }) => {
    await requests.form.cancel();
    await page.waitForURL(/\/requests$/);
  });

  test("shows validation errors on empty submit", async () => {
    await requests.form.submit();

    const errors = requests.form.getFieldErrors();
    await expect(errors.filter({ hasText: "Title is required" })).toBeVisible();
    await expect(errors.filter({ hasText: "City is required" })).toBeVisible();
    await expect(
      errors.filter({ hasText: "Expense date is required" })
    ).toBeVisible();
  });

  test("remove line item button removes a line item", async () => {
    await expect(requests.form.getDescriptionInputs()).toHaveCount(1);
    await requests.form.addLineItem();
    await expect(requests.form.getDescriptionInputs()).toHaveCount(2);
    await requests.form.removeLineItem();
    await expect(requests.form.getDescriptionInputs()).toHaveCount(1);
  });

  test("submits a reimbursement successfully", async ({ page }) => {
    await requests.form.fillTitle("E2E Test Reimbursement");
    await requests.form.selectCity("Bangalore");
    await requests.form.selectBankAccount();
    await requests.selectExpenseDate();

    await requests.form.fillLineItem({
      description: "Test expense item",
      amount: "500",
    });

    await requests.form.submit();

    await page.waitForURL(/\/requests\/[a-z0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByText("Reimbursement submitted")).toBeVisible();
  });
});
