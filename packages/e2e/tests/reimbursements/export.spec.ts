import { expect, test } from "../../fixtures/test";

test.describe("Export CSV (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/export");
    await expect(
      page.getByRole("heading", { name: "Export Data" })
    ).toBeVisible();
  });

  test("renders export page with controls", async ({ page }) => {
    await expect(
      page.getByRole("checkbox", { name: "Reimbursements" })
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Advance Payments" })
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Vendor Payments" })
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Pending" })).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Approved" })
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Rejected" })
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Financial Year" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export CSV" })
    ).toBeVisible();
  });

  test("export button is disabled when no data type is selected", async ({
    page,
  }) => {
    await page.getByRole("checkbox", { name: "Reimbursements" }).click();
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();

    await expect(
      page.getByRole("button", { name: "Export CSV" })
    ).toBeDisabled();
  });

  test("export button is disabled when no status is selected", async ({
    page,
  }) => {
    await page.getByRole("checkbox", { name: "Pending" }).click();
    await page.getByRole("checkbox", { name: "Approved" }).click();
    await page.getByRole("checkbox", { name: "Rejected" }).click();

    await expect(
      page.getByRole("button", { name: "Export CSV" })
    ).toBeDisabled();
  });

  test("downloads CSV file with expected headers", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    expect(filename).toMatch(
      /reimbursements_advance-payments_all-statuses_FY\d{4}-\d{2}_\d{4}-\d{2}-\d{2}\.csv/
    );

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString();
    const [headerLine] = content.split("\n");
    expect(headerLine).toContain("Type");
    expect(headerLine).toContain("Title");
    expect(headerLine).toContain("Status");

    await expect(page.getByText(/Exported \d+ \w+/)).toBeVisible();
  });

  test("downloads CSV with single type selected", async ({ page }) => {
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^reimbursements_/);
    await expect(page.getByText(/Exported \d+ \w+/)).toBeVisible();
  });

  test("can change financial year", async ({ page }) => {
    await page.getByRole("combobox", { name: "Financial Year" }).click();
    const options = page.getByRole("option");
    const count = await options.count();
    if (count > 1) {
      await options.nth(1).click();
    }

    await expect(
      page.getByRole("button", { name: "Export CSV" })
    ).toBeEnabled();
  });

  test("filters reimbursements by expense date", async ({ page }) => {
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();
    await page.getByRole("combobox", { name: "Financial Year" }).click();
    await page.getByRole("option", { name: "FY 2025-26" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString();

    expect(content).toContain("E2E Seed Reimbursement");
    expect(content).toContain("2026-01-15");
  });

  test("vendor payments checkbox shows VP status filters", async ({ page }) => {
    // VP status filters should not be visible initially
    await expect(
      page.getByRole("checkbox", { name: "Partially Paid" })
    ).not.toBeVisible();

    // Check vendor payments
    await page.getByRole("checkbox", { name: "Vendor Payments" }).click();

    // VP status filters should now be visible
    await expect(
      page.getByRole("checkbox", { name: "Partially Paid" })
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { exact: true, name: "Paid" })
    ).toBeVisible();
  });

  test("vendor payments checkbox shows transaction details option", async ({
    page,
  }) => {
    await expect(
      page.getByRole("checkbox", {
        name: "Include transaction details (separate CSV)",
      })
    ).not.toBeVisible();

    await page.getByRole("checkbox", { name: "Vendor Payments" }).click();

    await expect(
      page.getByRole("checkbox", {
        name: "Include transaction details (separate CSV)",
      })
    ).toBeVisible();
  });

  test("export button disabled when VP-only and all VP statuses unchecked", async ({
    page,
  }) => {
    // Uncheck request types, check vendor payments
    await page.getByRole("checkbox", { name: "Reimbursements" }).click();
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();
    await page.getByRole("checkbox", { name: "Vendor Payments" }).click();

    const vpStatusGroup = page.getByRole("group", {
      name: "Vendor payment status",
    });

    // Uncheck all VP statuses. Scope to the VP fieldset because request
    // statuses share labels such as Pending, Approved, and Rejected.
    await [
      "Pending",
      "Approved",
      "Rejected",
      "Partially Paid",
      "Paid",
      "Invoice Pending",
      "Completed",
    ].reduce(async (previousClick, status) => {
      await previousClick;
      await vpStatusGroup
        .getByRole("checkbox", { exact: true, name: status })
        .click();
    }, Promise.resolve());

    await expect(
      page.getByRole("button", { name: "Export CSV" })
    ).toBeDisabled();
  });

  test("downloads vendor payment CSV", async ({ page }) => {
    // Uncheck request types, check vendor payments only
    await page.getByRole("checkbox", { name: "Reimbursements" }).click();
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();
    await page.getByRole("checkbox", { name: "Vendor Payments" }).click();
    await page.getByRole("combobox", { name: "Financial Year" }).click();
    await page.getByRole("option", { name: "FY 2025-26" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^vendor-payments_FY2025-26_\d{4}-\d{2}-\d{2}\.csv$/
    );
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString();

    expect(content).toContain("E2E Export Vendor Payment");
    expect(content).toContain("2026-01-20");
    expect(content).not.toContain("E2E Event Vendor Payment");
    await expect(page.getByText(/Exported \d+ \w+/)).toBeVisible();
  });

  test("downloads mixed exports as one ZIP", async ({ page }) => {
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();
    await page.getByRole("checkbox", { name: "Vendor Payments" }).click();
    await page.getByRole("combobox", { name: "Financial Year" }).click();
    await page.getByRole("option", { name: "FY 2025-26" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^financial-exports_FY2025-26_\d{4}-\d{2}-\d{2}\.zip$/
    );
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const archive = Buffer.concat(chunks);
    const archiveText = archive.toString("latin1");

    expect(archive.subarray(0, 2).toString()).toBe("PK");
    expect(archiveText).toContain("reimbursements_all-statuses_FY2025-26_");
    expect(archiveText).toContain("vendor-payments_FY2025-26_");
    await expect(page.getByText(/Exported \d+ \w+/)).toBeVisible();
  });
});

test.describe("Export route access (volunteer)", () => {
  test("redirects non-admin away from /export", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/export");
    await page.waitForURL("/", { timeout: 10_000 });
  });
});
