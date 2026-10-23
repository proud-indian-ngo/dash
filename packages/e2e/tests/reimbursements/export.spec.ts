import type { Download } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

import { expect, test } from "../../fixtures/test";

async function readZip(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return unzipSync(new Uint8Array(Buffer.concat(chunks)));
}

function readCsv(
  archive: ReturnType<typeof unzipSync>,
  filenamePrefix: string
): string {
  const filename = Object.keys(archive).find(
    (entry) => entry.startsWith(filenamePrefix) && entry.endsWith(".csv")
  );
  const csv = filename ? archive[filename] : undefined;
  if (!(filename && csv)) {
    throw new Error(`Missing CSV with prefix: ${filenamePrefix}`);
  }
  return strFromU8(csv);
}

test.describe("Export ZIP (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/export");
    await expect(
      page.getByRole("heading", { name: "Export data" })
    ).toBeVisible();
  });

  test("renders the controls, changes financial year and reveals vendor payment options", async ({
    page,
  }) => {
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
      page.getByRole("button", { name: "Export ZIP" })
    ).toBeVisible();

    const financialYear = page.getByRole("combobox", {
      name: "Financial Year",
    });
    await financialYear.click();
    // Wait for the listbox: counting before it renders skips the pick and
    // leaves it open over the checkboxes below.
    const options = page.getByRole("listbox").getByRole("option");
    await expect(options.first()).toBeVisible();
    if ((await options.count()) > 1) {
      const nextYear = (await options.nth(1).textContent())?.trim() ?? "";
      await options.nth(1).click();
      await expect(financialYear).toContainText(nextYear);
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Export ZIP" })
    ).toBeEnabled();

    // Vendor payment options appear only once Vendor Payments is checked.
    await expect(
      page.getByRole("checkbox", { name: "Partially paid" })
    ).not.toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: "Include payment transactions",
      })
    ).not.toBeVisible();

    await page.getByRole("checkbox", { name: "Vendor Payments" }).click();

    await expect(
      page.getByRole("checkbox", { name: "Partially paid" })
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { exact: true, name: "Paid" })
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: "Include payment transactions",
      })
    ).toBeVisible();
  });

  test("export button is disabled when no data type is selected", async ({
    page,
  }) => {
    await page.getByRole("checkbox", { name: "Reimbursements" }).click();
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();

    await expect(
      page.getByRole("button", { name: "Export ZIP" })
    ).toBeDisabled();
  });

  test("export button is disabled when no status is selected", async ({
    page,
  }) => {
    await page.getByRole("checkbox", { name: "Pending" }).click();
    await page.getByRole("checkbox", { name: "Approved" }).click();
    await page.getByRole("checkbox", { name: "Rejected" }).click();

    await expect(
      page.getByRole("button", { name: "Export ZIP" })
    ).toBeDisabled();
  });

  test("downloads ZIP with expected CSV headers", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export ZIP" }).click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    expect(filename).toMatch(
      /^financial-exports_FY\d{4}-\d{2}_\d{4}-\d{2}-\d{2}\.zip$/
    );

    const archive = await readZip(download);
    const content = readCsv(
      archive,
      "reimbursements_advance-payments_all-statuses_FY"
    );
    const [headerLine] = content.split("\n");
    expect(headerLine).toContain("Type");
    expect(headerLine).toContain("Title");
    expect(headerLine).toContain("Status");
    expect(headerLine.split(",").slice(-4)).toEqual([
      "Programme",
      "Attachments",
      "Project",
      "Charged to",
    ]);

    await expect(page.getByText(/Exported \d+ \w+/)).toBeVisible();
  });

  test("downloads ZIP with single type selected", async ({ page }) => {
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export ZIP" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^financial-exports_FY/);
    expect(Object.keys(await readZip(download))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^reimbursements_all-statuses_FY.*\.csv$/),
      ])
    );
    await expect(page.getByText(/Exported \d+ \w+/)).toBeVisible();
  });

  test("filters reimbursements by expense date", async ({ page }) => {
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();
    await page.getByRole("checkbox", { name: "Pending" }).click();
    await page.getByRole("checkbox", { name: "Rejected" }).click();
    await page.getByRole("combobox", { name: "Financial Year" }).click();
    await page.getByRole("option", { name: "FY 2025-26" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export ZIP" }).click();
    const download = await downloadPromise;
    const content = readCsv(await readZip(download), "reimbursements_");

    expect(content).toContain("E2E Upcoming Event Reimbursement");
    expect(content).not.toContain("E2E Seed Reimbursement");
    expect(content).toContain("2026-01-15");
  });

  test("export button disabled when VP-only and all VP statuses unchecked", async ({
    page,
  }) => {
    // Uncheck request types, check vendor payments
    await page.getByRole("checkbox", { name: "Reimbursements" }).click();
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();
    await page.getByRole("checkbox", { name: "Vendor Payments" }).click();

    const vpStatusGroup = page.getByRole("group", {
      name: "Vendor payments",
      exact: true,
    });

    // Uncheck all VP statuses. Scope to the VP fieldset because request
    // statuses share labels such as Pending, Approved, and Rejected.
    await [
      "Pending",
      "Approved",
      "Rejected",
      "Partially paid",
      "Paid",
      "Invoice pending",
      "Completed",
    ].reduce(async (previousClick, status) => {
      await previousClick;
      await vpStatusGroup
        .getByRole("checkbox", { exact: true, name: status })
        .click();
    }, Promise.resolve());

    await expect(
      page.getByRole("button", { name: "Export ZIP" })
    ).toBeDisabled();
  });

  test("downloads ZIP with vendor payment CSV", async ({ page }) => {
    // Uncheck request types, check vendor payments only
    await page.getByRole("checkbox", { name: "Reimbursements" }).click();
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();
    await page.getByRole("checkbox", { name: "Vendor Payments" }).click();
    await page.getByRole("combobox", { name: "Financial Year" }).click();
    await page.getByRole("option", { name: "FY 2025-26" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export ZIP" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^financial-exports_FY2025-26_\d{4}-\d{2}-\d{2}\.zip$/
    );
    const content = readCsv(await readZip(download), "vendor-payments_FY");

    expect(content).toContain("E2E Export Vendor Payment");
    expect(content).toContain("2026-01-20");
    expect(content).not.toContain("E2E Event Vendor Payment");
    await expect(page.getByText(/Exported \d+ \w+/)).toBeVisible();
  });

  test("downloads mixed exports as one ZIP", async ({ page }) => {
    await page.getByRole("checkbox", { name: "Advance Payments" }).click();
    await page.getByRole("checkbox", { name: "Vendor Payments" }).click();
    const requestStatusGroup = page.getByRole("group", {
      name: "Reimbursements and advance payments",
    });
    await requestStatusGroup
      .getByRole("checkbox", { exact: true, name: "Pending" })
      .click();
    await requestStatusGroup
      .getByRole("checkbox", { exact: true, name: "Rejected" })
      .click();
    await page.getByRole("combobox", { name: "Financial Year" }).click();
    await page.getByRole("option", { name: "FY 2025-26" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export ZIP" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^financial-exports_FY2025-26_\d{4}-\d{2}-\d{2}\.zip$/
    );
    const archive = await readZip(download);
    expect(Object.keys(archive)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^reimbursements_approved_FY2025-26_.*\.csv$/),
        expect.stringMatching(/^vendor-payments_FY2025-26_.*\.csv$/),
      ])
    );
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
