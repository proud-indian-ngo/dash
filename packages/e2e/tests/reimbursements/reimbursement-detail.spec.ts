import { expect, test } from "../../fixtures/test";

test.describe("Reimbursement detail", () => {
  // These tests depend on having at least one reimbursement in the system.
  // If none exist, tests are skipped via conditional checks.

  test("admin sees Approve/Reject buttons for pending reimbursement", async ({
    page,
  }, testInfo) => {
    // Only run for admin project
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/reimbursements");
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();

    // Wait for table data to load from Zero
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    // Find a row with "Pending" status
    const pendingRow = table
      .getByRole("row")
      .filter({ hasText: /pending/i })
      .first();

    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    // Click the title button in the row
    await pendingRow.getByTestId("row-title").click();

    // Should see Approve and Reject buttons
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
  });

  test("volunteer does not see Approve/Reject buttons", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/reimbursements");
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();

    // Wait for table data to load from Zero
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    // Click the title button in the first data row
    const firstRow = table.getByRole("row").nth(1);
    const hasRows = (await firstRow.count()) > 0;
    test.skip(!hasRows, "No reimbursements available");

    const titleButton = firstRow.getByTestId("row-title");
    const hasTitle = (await titleButton.count()) > 0;
    test.skip(!hasTitle, "No reimbursement title button");
    await titleButton.click();

    // Should NOT see Approve/Reject
    await expect(page.getByRole("button", { name: "Approve" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Reject" })).toBeHidden();
  });

  test("admin reject opens alertdialog with reason textarea", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/reimbursements");

    // Wait for table data to load from Zero
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    const pendingRow = table
      .getByRole("row")
      .filter({ hasText: /pending/i })
      .first();

    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.getByTestId("row-title").click();
    await page.getByRole("button", { name: "Reject" }).click();

    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog.getByText("Reject reimbursement?")).toBeVisible();
    await expect(
      alertDialog.getByPlaceholder("Rejection reason...")
    ).toBeVisible();
    await expect(
      alertDialog.getByRole("button", { name: "Cancel" })
    ).toBeVisible();

    // Cancel closes the dialog
    await alertDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(alertDialog).toBeHidden();
  });

  test("admin edit submission button opens edit form", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/reimbursements");

    // Wait for table data to load from Zero
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    const pendingRow = table
      .getByRole("row")
      .filter({ hasText: /pending/i })
      .first();

    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.getByTestId("row-title").click();

    // Admin sees "Edit submission" button on detail view
    await page.getByRole("button", { name: "Edit submission" }).click();

    await expect(
      page.getByRole("heading", { name: "Edit Submission" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View details" })
    ).toBeVisible();

    // Edit form has Title field pre-populated
    await expect(page.getByLabel("Title")).toBeVisible();
    await expect(page.getByLabel("Title")).not.toHaveValue("");
  });

  test("admin approves a pending reimbursement", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    // Create a fresh reimbursement to approve
    await page.goto("/reimbursements/new");
    await page.getByLabel("Title").fill("E2E Approv Flow Test");
    await page.getByLabel("City").click();
    await page.getByRole("option", { name: "Bangalore" }).click();

    const bankAccountGroup = page
      .getByRole("group")
      .filter({ hasText: "Bank Account" });
    await expect(bankAccountGroup.getByRole("combobox")).toBeVisible({
      timeout: 15_000,
    });
    await bankAccountGroup.getByRole("combobox").click();
    await expect(page.getByRole("option")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("option").first().click();

    await page.getByLabel("Expense Date").click();
    const calendar = page.locator('[data-slot="calendar"]');
    await calendar.locator("td.rdp-today button").click();
    await page.getByLabel("Title").click();

    await page
      .locator('[data-slot="select-value"]:has-text("Category")')
      .click();
    await page.getByRole("option").first().click();
    await page.getByPlaceholder("Description").fill("Approve test item");
    await page.getByPlaceholder("0.00").fill("100");
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/\/reimbursements\/[a-z0-9-]+$/, { timeout: 10_000 });

    // Now approve it
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await page.getByRole("button", { name: "Approve" }).click();

    // Verify toast and status change
    await expect(page.getByText("Reimbursement approved")).toBeVisible();
    await expect(
      page.locator('[data-slot="badge"]', { hasText: "Approved" })
    ).toBeVisible({ timeout: 10_000 });

    // Approve/Reject buttons should disappear
    await expect(page.getByRole("button", { name: "Approve" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Reject" })).toBeHidden();
  });

  test("admin rejects a pending reimbursement with reason", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    // Create a fresh reimbursement to reject
    await page.goto("/reimbursements/new");
    await page.getByLabel("Title").fill("E2E Denial Flow Test");
    await page.getByLabel("City").click();
    await page.getByRole("option", { name: "Bangalore" }).click();

    const bankAccountGroup = page
      .getByRole("group")
      .filter({ hasText: "Bank Account" });
    await expect(bankAccountGroup.getByRole("combobox")).toBeVisible({
      timeout: 15_000,
    });
    await bankAccountGroup.getByRole("combobox").click();
    await expect(page.getByRole("option")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("option").first().click();

    await page.getByLabel("Expense Date").click();
    const calendar = page.locator('[data-slot="calendar"]');
    await calendar.locator("td.rdp-today button").click();
    await page.getByLabel("Title").click();

    await page
      .locator('[data-slot="select-value"]:has-text("Category")')
      .click();
    await page.getByRole("option").first().click();
    await page.getByPlaceholder("Description").fill("Reject test item");
    await page.getByPlaceholder("0.00").fill("200");
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/\/reimbursements\/[a-z0-9-]+$/, { timeout: 10_000 });

    // Open reject dialog
    await page.getByRole("button", { name: "Reject" }).click();
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();

    // Reject button should be disabled without a reason
    await expect(
      alertDialog.getByRole("button", { name: "Reject" })
    ).toBeDisabled();

    // Fill reason and confirm
    await alertDialog
      .getByPlaceholder("Rejection reason...")
      .fill("Not eligible");
    await alertDialog.getByRole("button", { name: "Reject" }).click();

    // Verify toast and status change
    await expect(page.getByText("Reimbursement rejected")).toBeVisible();
    await expect(
      page.locator('[data-slot="badge"]', { hasText: "Rejected" })
    ).toBeVisible({ timeout: 10_000 });

    // Approve/Reject buttons should disappear
    await expect(page.getByRole("button", { name: "Approve" })).toBeHidden();
  });

  test("admin edits submission and saves changes", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/reimbursements");
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    const pendingRow = table
      .getByRole("row")
      .filter({ hasText: /pending/i })
      .first();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.getByTestId("row-title").click();
    await page.getByRole("button", { name: "Edit submission" }).click();
    await expect(
      page.getByRole("heading", { name: "Edit Submission" })
    ).toBeVisible();

    // Edit the title
    const titleInput = page.getByLabel("Title");
    const editedTitle = `Edited ${Date.now()}`;
    await titleInput.clear();
    await titleInput.fill(editedTitle);

    // Save
    await page.getByRole("button", { name: "Submit" }).click();

    // Should show success toast
    await expect(page.getByText("Reimbursement submitted")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("line items table shows Category, Description, Amount", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/reimbursements");

    // Wait for table data to load from Zero
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    const firstRow = table.getByRole("row").nth(1);
    const hasRows = (await firstRow.count()) > 0;
    test.skip(!hasRows, "No reimbursements available");

    const titleButton = firstRow.getByTestId("row-title");
    const hasTitle = (await titleButton.count()) > 0;
    test.skip(!hasTitle, "No reimbursement title button");
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
