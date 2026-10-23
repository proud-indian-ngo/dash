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
    // A type without a number is refused before anything is sent.
    await dialog.getByRole("button", { name: "Add donor" }).click();
    await expect(
      page.getByText("Enter the ID number or set the ID type to none")
    ).toBeVisible();
    await expect(dialog).toBeVisible();
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

  test("deletes a donor without gifts", async ({ page }) => {
    const name = `E2E Delete Donor ${Date.now()}`;
    await page.getByRole("button", { name: "Add donor" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { exact: true, name: "Name" }).fill(name);
    await clickUntilDialogCloses(dialog, "Add donor");

    // Reload so the sheet that saving may open is out of the way.
    await page.goto("/donors");
    await page.getByPlaceholder("Search donors...").fill(name);
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await new ListPage(page).openRowActionAndClick(row, "Delete");
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(name);
    await confirm.getByRole("button", { name: "Delete donor" }).click();
    await expect(page.getByText("Donor deleted")).toBeVisible();
    await expect(row).toHaveCount(0, { timeout: 10_000 });
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

    // Contact details load for a viewer, but the identifier reveal and the
    // edit action need the finance permissions this role lacks.
    const list = new ListPage(page);
    await page.getByPlaceholder("Search donors...").fill("E2E Seed Donor");
    const row = page.getByRole("row").filter({ hasText: "E2E Seed Donor" });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await list.openRowActionAndClick(row, "View");
    await expect(page.getByText("seed-donor@pi-dash.test")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "Reveal" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { exact: true, name: "Edit" })
    ).toHaveCount(0);
  });
});

test.describe("Donor directory (volunteer)", () => {
  test("volunteers are redirected away", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/donors");
    await expect(page).not.toHaveURL(/\/donors/);
  });
});
