import { expect, test } from "../../fixtures/test";
import { RequestPage } from "../../pages/request-page";

test.describe("New advance payment request form", () => {
  let requests: RequestPage;

  test.beforeEach(async ({ page }) => {
    requests = new RequestPage(page, "advance_payment");
    await requests.navigateToNew();
    await requests.selectType("advance_payment");
  });

  test("renders form fields (no Expense Date)", async ({ page }) => {
    await expect(requests.form.getTitleInput()).toBeVisible();
    await expect(requests.form.getCityInput()).toBeVisible();
    await expect(page.getByText("Bank Account")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel("Expense Date")).toBeHidden();
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
  });

  test("remove line item button removes a line item", async () => {
    await expect(requests.form.getDescriptionInputs()).toHaveCount(1);
    await requests.form.addLineItem();
    await expect(requests.form.getDescriptionInputs()).toHaveCount(2);
    await requests.form.removeLineItem();
    await expect(requests.form.getDescriptionInputs()).toHaveCount(1);
  });

  test("submits an advance payment successfully", async ({ page }) => {
    await requests.form.fillTitle("E2E Test Advance Payment");
    await requests.form.selectCity("Bangalore");
    await requests.form.selectBankAccount();

    await requests.form.fillLineItem({
      description: "Test advance item",
      amount: "1000",
    });

    await requests.form.submit();

    await page.waitForURL(/\/requests\/[a-z0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByText("Advance Payment submitted")).toBeVisible();
  });
});
