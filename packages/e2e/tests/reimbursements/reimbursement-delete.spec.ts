import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursement delete (reimbursement)", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(({ page }) => {
    reimbursements = new ReimbursementPage(page, "reimbursement");
  });

  test("admin deletes a reimbursement via actions menu", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const title = await reimbursements.createReimbursement("Delete Admin");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    const row = reimbursements.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await reimbursements.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Delete reimbursement")).toBeVisible();
    await expect(
      dialog.getByText("permanently delete this reimbursement")
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Reimbursement deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });

  test("admin can cancel delete dialog", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const title = await reimbursements.createReimbursement("Delete Cancel");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    const row = reimbursements.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await reimbursements.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("volunteer sees Delete option for own pending reimbursement", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    const title = await reimbursements.createReimbursement("Delete Vol");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    const row = reimbursements.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await reimbursements.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Reimbursement deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });
});

// Advance payment creation is disabled in the UI.
test.describe
  .skip("Reimbursement delete (advance_payment)", () => {
    let reimbursements: ReimbursementPage;

    test.beforeEach(({ page }) => {
      reimbursements = new ReimbursementPage(page, "advance_payment");
    });

    test("admin deletes an advance payment via actions menu", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "admin", "Admin-only test");

      const title = await reimbursements.createReimbursement("Delete AP Admin");

      await reimbursements.navigateToList();
      await reimbursements.list.waitForTableData();

      const row = reimbursements.list.getRowByText(title);
      await expect(row).toBeVisible({ timeout: 10_000 });

      await reimbursements.list.openRowActionAndClick(row, "Delete");

      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Delete advance payment")).toBeVisible();
      await expect(
        dialog.getByText("permanently delete this advance payment")
      ).toBeVisible();

      await dialog.getByRole("button", { name: "Delete" }).click();

      await expect(page.getByText("Advance payment deleted")).toBeVisible();
      await expect(row).toBeHidden({ timeout: 10_000 });
    });

    test("volunteer sees Delete option for own pending advance payment", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

      const title = await reimbursements.createReimbursement("Delete AP Vol");

      await reimbursements.navigateToList();
      await reimbursements.list.waitForTableData();

      const row = reimbursements.list.getRowByText(title);
      await expect(row).toBeVisible({ timeout: 10_000 });

      await reimbursements.list.openRowActionAndClick(row, "Delete");

      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText("Advance payment deleted")).toBeVisible();
      await expect(row).toBeHidden({ timeout: 10_000 });
    });
  });
