import { expect, test } from "../../fixtures/test";
import { clickUntilDialogCloses } from "../../helpers/dialog-submit";
import { ListPage } from "../../pages/list-page";

test.describe("Vendor management (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/vendors");
    await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();
  });

  test("renders vendor list page with add button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Add vendor" })
    ).toBeVisible();
    await expect(page.getByPlaceholder("Search vendors...")).toBeVisible();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Add vendor" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test.slow();
  test("creates, edits, and deletes a vendor", async ({ page }) => {
    const vendorName = `E2E Vendor ${Date.now()}`;
    const editedName = `${vendorName} Edited`;
    const list = new ListPage(page);

    // Create
    await page.getByRole("button", { name: "Add vendor" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(vendorName);
    await dialog
      .getByRole("textbox", { exact: true, name: "Phone" })
      .fill(`+9198${Date.now().toString().slice(-8)}`);
    await dialog
      .getByRole("textbox", { name: "Bank Account Name" })
      .fill("Test Bank Account");
    const accountNumber = Date.now().toString().slice(-10).padStart(10, "1");
    const masked = `•••• ${accountNumber.slice(-4)}`;
    await dialog
      .getByRole("textbox", { name: "Account Number" })
      .fill(accountNumber);
    await dialog
      .getByRole("textbox", { name: "IFSC Code" })
      .fill("SBIN0001234");

    await clickUntilDialogCloses(dialog, "Add vendor");
    await page.getByPlaceholder("Search vendors...").fill(vendorName);
    await expect(list.getRowByText(vendorName).first()).toBeVisible({
      timeout: 10_000,
    });
    const row = page.getByRole("row").filter({ hasText: vendorName }).first();

    // The sheet shows the account masked; Reveal and Hide toggle the full number.
    await list.openRowActionAndClick(row, "View");
    const sheet = page.getByRole("dialog").filter({ hasText: "Bank details" });
    await expect(sheet.getByText(masked)).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByText(accountNumber)).toHaveCount(0);
    await sheet.getByRole("button", { name: "Reveal" }).click();
    await expect(sheet.getByText(accountNumber)).toBeVisible();
    await sheet.getByRole("button", { name: "Hide" }).click();
    await expect(sheet.getByText(masked)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // Edit — use dropdown menu (row actions)
    await list.openRowActionAndClick(row, "Edit");

    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await expect(
      editDialog.getByRole("heading", { name: "Edit vendor" })
    ).toBeVisible();

    await expect(
      editDialog.getByRole("textbox", { exact: true, name: "Name" })
    ).toHaveValue(vendorName);
    // The stored number is never sent back; leaving it blank keeps it.
    await expect(
      editDialog.getByRole("textbox", { name: "Account Number" })
    ).toHaveValue("");
    await expect(
      editDialog.getByText(`Stored, ending ${accountNumber.slice(-4)}`)
    ).toBeVisible();
    await editDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(editedName);
    await clickUntilDialogCloses(editDialog, "Save changes");
    await page.getByPlaceholder("Search vendors...").fill(editedName);
    await expect(list.getRowByText(editedName).first()).toBeVisible({
      timeout: 10_000,
    });
    const editedRowForView = page
      .getByRole("row")
      .filter({ hasText: editedName })
      .first();
    await list.openRowActionAndClick(editedRowForView, "View");
    const editedSheet = page
      .getByRole("dialog")
      .filter({ hasText: "Bank details" });
    await expect(editedSheet.getByText(masked)).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
    await expect(editedSheet).toBeHidden();

    // Delete — use dropdown menu (row actions)
    const editedRow = page
      .getByRole("row")
      .filter({ hasText: editedName })
      .first();
    await list.openRowActionAndClick(editedRow, "Delete");

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });
    await expect(list.getRowByText(editedName)).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test("editing a legacy vendor keeps its bank account", async ({ page }) => {
    const vendorName = "E2E Legacy Vendor";
    const masked = "•••• 9876";
    const list = new ListPage(page);
    const sheet = page.getByRole("dialog").filter({ hasText: "Bank details" });

    await page.getByPlaceholder("Search vendors...").fill(vendorName);
    const row = page.getByRole("row").filter({ hasText: vendorName }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await list.openRowActionAndClick(row, "View");
    await expect(sheet.getByText(masked)).toBeVisible({ timeout: 10_000 });
    await sheet.getByRole("button", { name: "Reveal" }).click();
    await expect(sheet.getByText("1234509876")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // Account number and PAN stay blank, so the save must carry the stored
    // ones over from the legacy row.
    const email = `legacy-${Date.now()}@example.com`;
    await list.openRowActionAndClick(row, "Edit");
    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", { name: "Edit vendor" })
    ).toBeVisible();
    await expect(
      editDialog.getByRole("textbox", { name: "Account Number" })
    ).toHaveValue("");
    await expect(
      editDialog.getByRole("textbox", { name: "PAN Number" })
    ).toHaveValue("");
    await editDialog.getByRole("textbox", { name: "Email" }).fill(email);
    await clickUntilDialogCloses(editDialog, "Save changes");

    await list.openRowActionAndClick(row, "View");
    await expect(sheet.getByText(email, { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(sheet.getByText(masked)).toBeVisible();
    await sheet.getByRole("button", { name: "Reveal" }).click();
    await expect(sheet.getByText("1234509876")).toBeVisible();
  });
});

test.describe("Vendor route access (volunteer)", () => {
  test("redirects non-admin away from /vendors", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/vendors");
    // Should be redirected to home
    await page.waitForURL("/", { timeout: 10_000 });
  });
});
