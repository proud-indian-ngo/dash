import { expect, test } from "../../fixtures/test";

test.describe("Advance payment detail", () => {
  test("admin sees Approve/Reject buttons for pending advance payment", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/advance-payments");
    await expect(
      page.getByRole("heading", { name: "Advance Payments" })
    ).toBeVisible();

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
    test.skip(!hasPending, "No pending advance payments available");

    await pendingRow.getByTestId("row-title").click();

    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
  });

  test("volunteer does not see Approve/Reject buttons", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/advance-payments");
    await expect(
      page.getByRole("heading", { name: "Advance Payments" })
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
    test.skip(!hasRows, "No advance payments available");

    const titleButton = firstRow.getByTestId("row-title");
    const hasTitle = (await titleButton.count()) > 0;
    test.skip(!hasTitle, "No advance payment title button");
    await titleButton.click();

    await expect(page.getByRole("button", { name: "Approve" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Reject" })).toBeHidden();
  });

  test("admin reject opens alertdialog with reason textarea", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/advance-payments");

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
    test.skip(!hasPending, "No pending advance payments available");

    await pendingRow.getByTestId("row-title").click();
    await page.getByRole("button", { name: "Reject" }).click();

    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await expect(
      alertDialog.getByPlaceholder("Rejection reason...")
    ).toBeVisible();
    await expect(
      alertDialog.getByRole("button", { name: "Cancel" })
    ).toBeVisible();

    await alertDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(alertDialog).toBeHidden();
  });

  test("admin approves a pending advance payment", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    // Create a fresh advance payment to approve
    await page.goto("/advance-payments/new");
    await page.getByLabel("Title").fill("E2E Approv AP Flow");
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

    await page
      .locator('[data-slot="select-value"]:has-text("Category")')
      .click();
    await page.getByRole("option").first().click();
    await page.getByPlaceholder("Description").fill("Approve AP test item");
    await page.getByPlaceholder("0.00").fill("500");
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/\/advance-payments\/[a-z0-9-]+$/, {
      timeout: 10_000,
    });

    // Approve it
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await page.getByRole("button", { name: "Approve" }).click();

    // Verify toast and status change
    await expect(page.getByText("Advance payment approved")).toBeVisible();
    await expect(
      page.locator('[data-slot="badge"]', { hasText: "Approved" })
    ).toBeVisible({ timeout: 10_000 });

    // Approve/Reject buttons should disappear
    await expect(page.getByRole("button", { name: "Approve" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Reject" })).toBeHidden();
  });

  test("admin rejects a pending advance payment with reason", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    // Create a fresh advance payment to reject
    await page.goto("/advance-payments/new");
    await page.getByLabel("Title").fill("E2E Denial AP Flow");
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

    await page
      .locator('[data-slot="select-value"]:has-text("Category")')
      .click();
    await page.getByRole("option").first().click();
    await page.getByPlaceholder("Description").fill("Reject AP test item");
    await page.getByPlaceholder("0.00").fill("300");
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/\/advance-payments\/[a-z0-9-]+$/, {
      timeout: 10_000,
    });

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
      .fill("Budget exceeded");
    await alertDialog.getByRole("button", { name: "Reject" }).click();

    // Verify toast and status change
    await expect(page.getByText("Advance payment rejected")).toBeVisible();
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

    await page.goto("/advance-payments");
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
    test.skip(!hasPending, "No pending advance payments available");

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
    await expect(page.getByText("Advance payment submitted")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("admin edit submission button opens edit form", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/advance-payments");

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
    test.skip(!hasPending, "No pending advance payments available");

    await pendingRow.getByTestId("row-title").click();

    await page.getByRole("button", { name: "Edit submission" }).click();

    await expect(
      page.getByRole("heading", { name: "Edit Submission" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View details" })
    ).toBeVisible();

    // Edit form has Title pre-populated, no Expense Date
    await expect(page.getByLabel("Title")).toBeVisible();
    await expect(page.getByLabel("Title")).not.toHaveValue("");
    await expect(page.getByLabel("Expense Date")).toBeHidden();
  });

  test("attachments section shows Preview/Download links", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/advance-payments");

    // Wait for table data to load from Zero
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    const firstRow = table.getByRole("row").nth(1);
    const hasRows = (await firstRow.count()) > 0;
    test.skip(!hasRows, "No advance payments available");

    const titleButton = firstRow.getByTestId("row-title");
    const hasTitle = (await titleButton.count()) > 0;
    test.skip(!hasTitle, "No advance payment title button");
    await titleButton.click();

    // Attachments section may or may not be present
    const attachmentsHeading = page.getByText("Attachments");
    if ((await attachmentsHeading.count()) > 0) {
      await expect(page.getByText("Preview").first()).toBeVisible();
      await expect(page.getByText("Download").first()).toBeVisible();
    }
  });
});
