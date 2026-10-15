import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickPageAction } from "../../helpers/page-header";

const ACCOUNT = "E2E Bank Account";
const FIXTURE = path.resolve(
  import.meta.dirname,
  "../../fixtures/income/import-contributions.csv"
);

/**
 * A PAN for this run (five letters, four digits, one letter) from a hash of
 * the run ID, so about 3 × 10¹² values: an earlier run's donor will not match.
 */
function runPan(run: string): string {
  const bytes = createHash("sha256").update(run).digest();
  const letter = (i: number) =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[(bytes[i] ?? 0) % 26] ?? "A";
  const digit = (i: number) => String((bytes[i] ?? 0) % 10);
  return (
    [0, 1, 2, 3, 4].map(letter).join("") +
    [5, 6, 7, 8].map(digit).join("") +
    letter(9)
  );
}

function fixtureCsv(run: string, edit?: (text: string) => string): Buffer {
  const text = readFileSync(FIXTURE, "utf8")
    .replaceAll("{RUN}", run)
    .replaceAll("{PAN}", runPan(run));
  return Buffer.from(edit ? edit(text) : text, "utf8");
}

async function uploadAndReview(page: Page, name: string, csv: Buffer) {
  await page.goto("/income");
  await waitForZeroReady(page);
  await clickPageAction(page, "Import contributions");
  await expect(
    page.getByRole("heading", { name: "Import contributions" })
  ).toBeVisible();

  // Uploads start as give.do; these files are generic spreadsheets.
  await page.getByLabel("Source").click();
  await page.getByRole("option", { exact: true, name: "Generic CSV" }).click();
  const account = page.getByRole("combobox", { name: "Deposited into" });
  // A UPI batch goes into a bank account: the give.do clearing account no
  // longer fits, so it is cleared, and clearing accounts are not offered.
  await expect(account).not.toHaveValue(/clearing/i);
  await expect(account).not.toHaveAttribute("data-disabled");
  await account.click();
  await account.fill("clearing");
  await expect(
    page.getByRole("option").filter({ hasText: /clearing/i })
  ).toHaveCount(0);
  await account.fill(ACCOUNT);
  await page.getByRole("option").filter({ hasText: ACCOUNT }).first().click();
  await page
    .getByTestId("import-file-input")
    .setInputFiles({ buffer: csv, mimeType: "text/csv", name });
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: the headers map themselves by synonym.
  await expect(page.locator('[data-column="Donation ID"]')).toContainText(
    "External donation ID"
  );
  await expect(page.locator('[data-column="Amount"]')).toContainText(
    "Amount (₹)"
  );
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("tab", { name: /^All 4$/ })).toBeVisible({
    timeout: 20_000,
  });
}

const tab = (page: Page, label: RegExp): Locator =>
  page.getByRole("tab", { name: label });

test.describe("Income: CSV import", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("imports a file, then recognises re-uploads and changed rows", async ({
    page,
  }) => {
    test.slow();
    const run = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const donor = `E2E Import Donor ${run}`;

    await uploadAndReview(page, `donations-${run}.csv`, fixtureCsv(run));
    // Row 4 repeats row 1 inside the same file: nothing is imported yet.
    await expect(page.getByTestId("import-review-summary")).toHaveText(
      "2 gifts to import · 1 new donor · 1 repeated in file · 1 error"
    );
    await expect(tab(page, /^New donor 2$/)).toBeVisible();
    await expect(tab(page, /^Errors 1$/)).toBeVisible();
    await expect(tab(page, /^Repeated in file 1$/)).toBeVisible();
    await expect(tab(page, /^Already imported/)).toHaveCount(0);
    const repeat = page.locator('[data-row-number="4"]');
    await expect(repeat).toContainText("Repeated in file");
    await expect(repeat).toContainText("Same as row 1; counted once");
    const second = page.locator('[data-row-number="2"]');
    await expect(second).toContainText("New donor");
    await expect(second).toContainText("Same donor as row 1");
    await tab(page, /^Errors 1$/).click();
    await expect(page.locator('[data-row-number="3"]')).toContainText(
      "Amount is not a number"
    );

    await page.getByRole("button", { name: "Import 2 contributions" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(
      "2 contributions will be imported, 1 new donor created, 1 row skipped. 1 row repeats an earlier row and is counted once."
    );
    await confirm.getByRole("button", { name: "Import" }).click();
    const result = page.getByTestId("import-result");
    await expect(result).toContainText("2 contributions imported");
    await expect(result).toContainText("1 new donor created");
    await expect(result).toContainText(
      "1 row repeated an earlier row and was counted once"
    );

    await page
      .getByRole("link", { name: "View imported contributions" })
      .click();
    await waitForZeroReady(page);
    await expect(page.getByRole("row").filter({ hasText: donor })).toHaveCount(
      2,
      { timeout: 15_000 }
    );

    await page.goto("/donors");
    await waitForZeroReady(page);
    await page
      .getByPlaceholder(/Search/)
      .first()
      .fill(donor);
    await expect(page.getByRole("row").filter({ hasText: donor })).toHaveCount(
      1,
      { timeout: 15_000 }
    );

    // The same file again: nothing new, every good row is already imported.
    await uploadAndReview(page, `donations-${run}-again.csv`, fixtureCsv(run));
    await expect(tab(page, /^Already imported 3$/)).toBeVisible();
    await expect(tab(page, /^Errors 1$/)).toBeVisible();
    await expect(tab(page, /^Ready/)).toHaveCount(0);
    await expect(tab(page, /^New donor/)).toHaveCount(0);
    await expect(tab(page, /^Repeated in file/)).toHaveCount(0);
    await expect(page.locator('[data-row-number="4"]')).toContainText(
      "Already imported"
    );

    // One amount changed under the same donation ID: a conflict, never an overwrite.
    await uploadAndReview(
      page,
      `donations-${run}-changed.csv`,
      fixtureCsv(run, (text) =>
        text.replace(
          `import-${run}@example.com,500,`,
          `import-${run}@example.com,600,`
        )
      )
    );
    await expect(tab(page, /^Conflicts 1$/)).toBeVisible();
    await expect(tab(page, /^Already imported 2$/)).toBeVisible();
  });

  test("lists the import on the Imports tab and opens its rows", async ({
    page,
  }) => {
    test.slow();
    const run = String(Date.now() + 7);
    const file = `imports-tab-${run}.csv`;
    await uploadAndReview(page, file, fixtureCsv(run));
    await page.getByRole("button", { name: "Import 2 contributions" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Import" })
      .click();
    await expect(page.getByTestId("import-result")).toBeVisible();

    await page.goto("/income?tab=imports");
    await waitForZeroReady(page);
    const row = page.getByRole("row").filter({ hasText: file });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await expect(row).toContainText("Completed");
    await row.click();
    await expect(page.getByRole("heading", { name: file })).toBeVisible();
    await expect(page.locator('[data-row-number="1"]')).toContainText(
      "Imported"
    );
    await expect(page.locator('[data-row-number="3"]')).toContainText("Error");
    const repeat = page.locator('[data-row-number="4"]');
    await expect(repeat).toContainText("Repeated in file");
    await expect(repeat).toContainText("Same as row 1; counted once");
  });
});
