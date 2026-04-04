import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

test.describe("Vendor approval/unapproval (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("admin can unapprove an approved vendor then approve it again", async ({
    page,
  }) => {
    test.slow();

    // Create a vendor — it auto-approves for admin (has vendors.approve)
    await page.goto("/vendors");
    await waitForZeroReady(page);

    const vendorName = `E2E Approval ${Date.now()}`;
    await page.getByRole("button", { name: "Add vendor" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(vendorName);
    await dialog
      .getByRole("textbox", { name: "Phone", exact: true })
      .fill("+91-9876543210");
    await dialog
      .getByRole("textbox", { name: "Bank Account Name" })
      .fill("Test Account");
    await dialog
      .getByRole("textbox", { name: "Account Number" })
      .fill("1234567890");
    await dialog
      .getByRole("textbox", { name: "IFSC Code" })
      .fill("SBIN0001234");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Vendor created")).toBeVisible();
    await expect(page.getByText(vendorName)).toBeVisible({ timeout: 10_000 });

    const list = new ListPage(page);
    const row = page.getByRole("row").filter({ hasText: vendorName });

    // Unapprove the auto-approved vendor
    await list.openRowActionAndClick(row, "Unapprove");
    await expect(page.getByText("Vendor unapproved")).toBeVisible({
      timeout: 10_000,
    });

    // Row should now show "Pending" badge
    await expect(row.getByText(/Pending/i)).toBeVisible({ timeout: 10_000 });

    // Approve it again
    await list.openRowActionAndClick(row, "Approve");
    await expect(page.getByText("Vendor approved")).toBeVisible({
      timeout: 10_000,
    });

    // Row should now show "Approved" badge
    await expect(row.getByText(/Approved/i)).toBeVisible({ timeout: 10_000 });
  });
});
