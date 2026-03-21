import { expect, test } from "../../fixtures/test";
import { RequestPage } from "../../pages/request-page";

test.describe("Request delete (reimbursement)", () => {
  let requests: RequestPage;

  test.beforeEach(({ page }) => {
    requests = new RequestPage(page, "reimbursement");
  });

  test("admin deletes a request via actions menu", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const title = await requests.createRequest("Delete Admin");

    await requests.navigateToList();
    await requests.list.waitForTableData();

    const row = requests.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await requests.list.openRowActionAndClick(row, "Delete");

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

    const title = await requests.createRequest("Delete Cancel");

    await requests.navigateToList();
    await requests.list.waitForTableData();

    const row = requests.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await requests.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("volunteer sees Delete option for own pending request", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    const title = await requests.createRequest("Delete Vol");

    await requests.navigateToList();
    await requests.list.waitForTableData();

    const row = requests.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await requests.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Reimbursement deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });
});

test.describe("Request delete (advance_payment)", () => {
  let requests: RequestPage;

  test.beforeEach(({ page }) => {
    requests = new RequestPage(page, "advance_payment");
  });

  test("admin deletes an advance payment via actions menu", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const title = await requests.createRequest("Delete AP Admin");

    await requests.navigateToList();
    await requests.list.waitForTableData();

    const row = requests.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await requests.list.openRowActionAndClick(row, "Delete");

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

    const title = await requests.createRequest("Delete AP Vol");

    await requests.navigateToList();
    await requests.list.waitForTableData();

    const row = requests.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await requests.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Advance payment deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });
});
