import { expect, test } from "../../fixtures/test";
import { createVendorPayment } from "../../helpers/vendor-payment";

const APPROVER_ROLES = new Set(["super_admin", "finance_admin"]);

test.describe("Vendor payment approval (super_admin + finance_admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      !APPROVER_ROLES.has(testInfo.project.name),
      "Only roles with requests.approve"
    );
  });

  /** Assert the VP status badge shows the expected text. */
  async function expectStatus(
    page: import("@playwright/test").Page,
    status: string
  ) {
    await expect(
      page.locator('[data-slot="badge"]').getByText(status, { exact: true })
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

  test("approve a vendor payment request", async ({ page }) => {
    test.slow();
    const title = await createVendorPayment(page, "Approve");

    await expect(page.getByText(title)).toBeVisible();
    await expectStatus(page, "Pending");

    await page.getByRole("button", { name: "Approve" }).first().click();
    await approveInDialog(page);

    await expectStatus(page, "Approved");
  });

  test("reject a vendor payment request with reason", async ({ page }) => {
    test.slow();
    const title = await createVendorPayment(page, "Reject");

    await expect(page.getByText(title)).toBeVisible();
    await expectStatus(page, "Pending");

    await page.getByRole("button", { name: "Reject" }).click();
    await rejectInDialog(page, "Budget exceeded");

    await expectStatus(page, "Rejected");
    await expect(page.getByText("Budget exceeded").first()).toBeVisible();
  });
});
