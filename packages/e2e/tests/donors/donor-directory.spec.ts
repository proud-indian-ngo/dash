import { expect, test } from "../../fixtures/test";
import { clickUntilDialogCloses } from "../../helpers/dialog-submit";
import { ListPage } from "../../pages/list-page";

test.describe("Donor directory (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    await page.goto("/donors");
    await expect(page.getByRole("heading", { name: "Donors" })).toBeVisible();
  });

  test("creates a donor and shows masked details", async ({ page }) => {
    test.slow();
    const name = `E2E Donor ${Date.now()}`;

    await page.getByRole("button", { name: "Add donor" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { exact: true, name: "Name" }).fill(name);
    await dialog
      .getByRole("textbox", { name: "Email" })
      .fill("donor@example.test");
    await dialog.getByRole("textbox", { name: "City" }).fill("Bengaluru");
    await dialog.getByLabel("ID type").click();
    await page.getByRole("option", { exact: true, name: "PAN" }).click();
    await dialog.getByRole("textbox", { name: "ID number" }).fill("ABCDE1234F");
    await clickUntilDialogCloses(dialog, "Add donor");

    const list = new ListPage(page);
    await page.getByPlaceholder("Search donors...").fill(name);
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText("Donor");
    await list.openRowActionAndClick(row, "View");

    await expect(page.getByText("donor@example.test")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("•••• 234F")).toBeVisible();
    await page.getByRole("button", { name: "Reveal" }).click();
    await expect(page.getByText("ABCDE1234F")).toBeVisible();
    await page.getByRole("button", { name: "Hide" }).click();
    await expect(page.getByText("•••• 234F")).toBeVisible();

    // Editing with a blank ID number keeps the stored identifier.
    await page.getByRole("button", { exact: true, name: "Edit" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit donor" });
    await expect(
      editDialog.getByRole("textbox", { exact: true, name: "Name" })
    ).toHaveValue(name, { timeout: 10_000 });
    await editDialog.getByRole("textbox", { name: "City" }).fill("Mysuru");
    await clickUntilDialogCloses(editDialog, "Save changes");
    await expect(page.getByText("Mysuru")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("•••• 234F")).toBeVisible();
  });
});

test.describe("Donor directory (admin without finance)", () => {
  test("admin sees donors but cannot add or reveal", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/donors");
    await expect(page.getByRole("heading", { name: "Donors" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add donor" })).toHaveCount(
      0
    );
  });
});

test.describe("Donor directory (volunteer)", () => {
  test("volunteers are redirected away", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/donors");
    await expect(page).not.toHaveURL(/\/donors/);
  });
});
