import { expect, test } from "../../fixtures/test";
import { RequestPage } from "../../pages/request-page";

test.describe("Request detail (reimbursement)", () => {
  let requests: RequestPage;

  test.beforeEach(({ page }) => {
    requests = new RequestPage(page, "reimbursement");
  });

  test("admin sees Approve/Reject buttons for pending request", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await requests.navigateToList();
    await requests.list.waitForTableData();

    const pendingRow = requests.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending requests available");

    await pendingRow.getByTestId("row-title").click();

    await expect(requests.detail.getApproveButton()).toBeVisible();
    await expect(requests.detail.getRejectButton()).toBeVisible();
  });

  test("volunteer does not see Approve/Reject buttons", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await requests.navigateToList();
    await requests.list.waitForTableData();

    const firstRow = requests.list.getRows().nth(1);
    const hasRows = (await firstRow.count()) > 0;
    test.skip(!hasRows, "No requests available");

    const titleButton = firstRow.getByTestId("row-title");
    const hasTitle = (await titleButton.count()) > 0;
    test.skip(!hasTitle, "No request title button");
    await titleButton.click();

    await expect(requests.detail.getApproveButton()).toBeHidden();
    await expect(requests.detail.getRejectButton()).toBeHidden();
  });

  test("admin approves a pending reimbursement", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await requests.createRequest("Approv Flow Test");

    await expect(requests.detail.getApproveButton()).toBeVisible();
    await requests.detail.approve();

    await expect(page.getByText("Reimbursement approved")).toBeVisible();
    await expect(requests.detail.getStatusBadge("Approved")).toBeVisible({
      timeout: 10_000,
    });

    await expect(requests.detail.getApproveButton()).toBeHidden();
    await expect(requests.detail.getRejectButton()).toBeHidden();
  });

  test("admin rejects a pending reimbursement with reason", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await requests.createRequest("Denial Flow Test");

    await requests.detail.reject("Not eligible");

    await expect(page.getByText("Reimbursement rejected")).toBeVisible();
    await expect(requests.detail.getStatusBadge("Rejected")).toBeVisible({
      timeout: 10_000,
    });

    await expect(requests.detail.getApproveButton()).toBeHidden();
  });

  test("admin edit submission button opens edit form", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await requests.navigateToList();
    await requests.list.waitForTableData();

    const pendingRow = requests.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending requests available");

    await pendingRow.getByTestId("row-title").click();

    await requests.detail.editSubmission();

    await expect(page.getByRole("heading", { name: /Edit/ })).toBeVisible();
    await expect(requests.detail.getViewDetailsButton()).toBeVisible();
    await expect(requests.form.getTitleInput()).toBeVisible();
    await expect(requests.form.getTitleInput()).not.toHaveValue("");
  });

  test("admin edits submission and saves changes", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await requests.navigateToList();
    await requests.list.waitForTableData();

    const pendingRow = requests.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending requests available");

    await pendingRow.getByTestId("row-title").click();
    await requests.detail.editSubmission();
    await expect(page.getByRole("heading", { name: /Edit/ })).toBeVisible();

    const editedTitle = `Edited ${Date.now()}`;
    await requests.form.getTitleInput().clear();
    await requests.form.fillTitle(editedTitle);

    await requests.form.submit();

    await expect(page.getByText("submitted")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("line items table shows Category, Description, Amount", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await requests.navigateToList();
    await requests.list.waitForTableData();

    const firstRow = requests.list.getRows().nth(1);
    const hasRows = (await firstRow.count()) > 0;
    test.skip(!hasRows, "No requests available");

    const titleButton = firstRow.getByTestId("row-title");
    const hasTitle = (await titleButton.count()) > 0;
    test.skip(!hasTitle, "No request title button");
    await titleButton.click();

    await expect(page.getByText("Line items")).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /Category/ })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /Description/ })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /Amount/ })
    ).toBeVisible();
  });
});

test.describe("Request detail (advance_payment)", () => {
  let requests: RequestPage;

  test.beforeEach(({ page }) => {
    requests = new RequestPage(page, "advance_payment");
  });

  test("advance payment detail does not show Expense Date", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await requests.createRequest("AP Detail NoDate");

    await expect(page.getByText("Advance Payment")).toBeVisible();
    await expect(page.getByText("Expense Date")).toBeHidden();
  });

  test("admin approves a pending advance payment", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await requests.createRequest("AP Approve Flow");

    await expect(requests.detail.getApproveButton()).toBeVisible();
    await requests.detail.approve();

    await expect(page.getByText("Advance payment approved")).toBeVisible();
    await expect(requests.detail.getStatusBadge("Approved")).toBeVisible({
      timeout: 10_000,
    });

    await expect(requests.detail.getApproveButton()).toBeHidden();
    await expect(requests.detail.getRejectButton()).toBeHidden();
  });

  test("admin rejects a pending advance payment with reason", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await requests.createRequest("AP Reject Flow");

    await requests.detail.reject("Budget exceeded");

    await expect(page.getByText("Advance payment rejected")).toBeVisible();
    await expect(requests.detail.getStatusBadge("Rejected")).toBeVisible({
      timeout: 10_000,
    });

    await expect(requests.detail.getApproveButton()).toBeHidden();
  });
});
