import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickUntilDialogCloses } from "../../helpers/dialog-submit";
import { ListPage } from "../../pages/list-page";

test.describe("Vendor approval/unapproval (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("admin can approve a vendor, unapprove it, then approve it again", async ({
    page,
  }) => {
    test.slow();

    await page.goto("/vendors");
    await waitForZeroReady(page);

    const uniqueSuffix = Date.now().toString();
    const vendorName = `E2E Approval ${uniqueSuffix}`;
    await page.getByRole("button", { name: "Add vendor" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(vendorName);
    await dialog
      .getByRole("textbox", { exact: true, name: "Phone" })
      .fill(`+9198${uniqueSuffix.slice(-8)}`);
    await dialog
      .getByRole("textbox", { name: "Bank Account Name" })
      .fill("Test Account");
    await dialog
      .getByRole("textbox", { name: "Account Number" })
      .fill(uniqueSuffix.slice(-10).padStart(10, "1"));
    await dialog
      .getByRole("textbox", { name: "IFSC Code" })
      .fill("SBIN0001234");
    await clickUntilDialogCloses(dialog, "Create");
    await expect(page.getByText("Vendor created")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByPlaceholder("Search vendors...").fill(vendorName);
    await expect(page.getByText(vendorName).first()).toBeVisible({
      timeout: 15_000,
    });

    const list = new ListPage(page);
    const row = page.getByRole("row").filter({ hasText: vendorName }).first();
    await expect(row.getByText(/Pending/i)).toBeVisible({ timeout: 10_000 });

    await list.openRowActionAndClick(row, "Approve");
    await expect(page.getByText("Vendor approved")).toBeVisible({
      timeout: 10_000,
    });
    await expect(row.getByText(/Approved/i)).toBeVisible({ timeout: 10_000 });

    await list.openRowActionAndClick(row, "Unapprove");
    await expect(page.getByText("Vendor unapproved")).toBeVisible({
      timeout: 10_000,
    });

    await expect(row.getByText(/Pending/i)).toBeVisible({ timeout: 10_000 });

    await list.openRowActionAndClick(row, "Approve");
    await expect(page.getByText("Vendor approved")).toBeVisible({
      timeout: 10_000,
    });

    await expect(row.getByText(/Approved/i)).toBeVisible({ timeout: 10_000 });
  });
});
