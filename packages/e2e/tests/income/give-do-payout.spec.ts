import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { applyQuickFilter } from "../../helpers/quick-filters";

const execFileAsync = promisify(execFile);
const PAYOUT_FIXTURE = path.resolve(
  import.meta.dirname,
  "../../fixtures/give-do/payout-sample.xlsx"
);
const BANK_ACCOUNT_ID = "01930000-0000-7000-8000-000000000711";
const BANK_ACCOUNT_NAME = "E2E Bank Account";

interface PayoutRun {
  donorOne: string;
  donorTwo: string;
  id: string;
  utr: string;
  workbook: Buffer;
}

function newPayoutRun(): PayoutRun {
  const id = `payout${Date.now()}${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const phoneSuffix = String(Date.now()).slice(-8);
  const donorOne = `E2E Payout Donor One ${id}`;
  const donorTwo = `E2E Payout Donor Two ${id}`;
  const replacements = new Map([
    ["GIVEDO20261012", `GD${id}`],
    ["CAMPAIGN001", `CAMPAIGN${id}`],
    ["LC0000000000001", `LC${id}1`],
    ["LC0000000000002", `LC${id}2`],
    ["Synthetic Donor One", donorOne],
    ["Synthetic Donor Two", donorTwo],
    ["donor.one@example.invalid", `payout-one-${id}@example.invalid`],
    ["donor.two@example.invalid", `payout-two-${id}@example.invalid`],
    ["+919999990001", `+9198${phoneSuffix}`],
    ["+919999990002", `+9197${phoneSuffix}`],
  ]);
  const files = unzipSync(readFileSync(PAYOUT_FIXTURE));
  for (const [fileName, bytes] of Object.entries(files)) {
    if (!(fileName.endsWith(".xml") || fileName.endsWith(".xml.rels"))) {
      continue;
    }
    let contents = strFromU8(bytes);
    for (const [from, to] of replacements) {
      contents = contents.replaceAll(from, to);
    }
    files[fileName] = strToU8(contents);
  }
  return {
    donorOne,
    donorTwo,
    id,
    utr: `GD${id}`,
    workbook: Buffer.from(zipSync(files, { level: 6 })),
  };
}

async function uploadPayout(page: Page, run: PayoutRun) {
  await page.goto("/income/payout/import");
  await waitForZeroReady(page);
  await expect(
    page.getByRole("heading", { exact: true, name: "Import give.do payout" })
  ).toBeVisible();
  const account = page.getByRole("combobox", {
    name: "give.do clearing account",
  });
  await expect(account).toHaveValue("E2E give.do clearing");
  await expect(account).toHaveAttribute("data-disabled", "");
  await page.getByTestId("payout-file-input").setInputFiles({
    buffer: run.workbook,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    name: `give-do-payout-${run.id}.xlsx`,
  });
  await page.getByRole("button", { name: "Review payout" }).click();
  await expect(page.getByTestId("payout-totals")).toContainText(run.utr, {
    timeout: 20_000,
  });
}

function statementCsv(run: PayoutRun): Buffer {
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "2-digit",
  }).format(new Date());
  return Buffer.from(
    [
      "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
      `${date},GIVEDO PAYOUT ${run.utr},${run.utr},${date},,1463.00,1463.00`,
    ].join("\n"),
    "utf8"
  );
}

async function importBankCredit(page: Page, run: PayoutRun) {
  await page.goto(`/income/bank/import?account=${BANK_ACCOUNT_ID}`);
  await waitForZeroReady(page);
  const picker = page.getByRole("combobox", { name: "Bank account" });
  await picker.click();
  await picker.fill(BANK_ACCOUNT_NAME);
  await page
    .getByRole("option")
    .filter({ hasText: BANK_ACCOUNT_NAME })
    .first()
    .click();
  await page.getByTestId("import-file-input").setInputFiles({
    buffer: statementCsv(run),
    mimeType: "text/csv",
    name: `give-do-bank-${run.id}.csv`,
  });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator('[data-column="Deposit Amt."]')).toContainText(
    "Deposit (credit)"
  );
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("statement-review-summary")).toContainText(
    "1 new line, 0 already imported"
  );
  await page.getByRole("button", { name: "Import 1 line" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Import lines" })
    .click();
  const result = page.getByTestId("statement-import-result");
  await expect(result).toContainText("1 line imported");
  await expect(result).toContainText("0 lines matched");
  await page.getByRole("link", { name: "Review the lines" }).click();
  await waitForZeroReady(page);
  return page.url();
}

async function openContribution(page: Page, donor: string) {
  await page.goto("/income");
  await waitForZeroReady(page);
  await page.getByPlaceholder("Search donor or reference...").fill(donor);
  const row = page.getByRole("row").filter({ hasText: donor });
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await row.getByText(donor).click();
  return page.getByRole("dialog");
}

test.describe("Income: give.do payout", () => {
  test("matches an earlier bank credit, imports donations and remains idempotent", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    test.slow();
    const run = newPayoutRun();
    const bankUrl = await importBankCredit(page, run);

    await uploadPayout(page, run);
    const totals = page.getByTestId("payout-totals");
    await expect(totals).toContainText("2 donations");
    await expect(totals).toContainText("Gross ₹1,500.00");
    await expect(totals).toContainText("Charges ₹37.00");
    await expect(totals).toContainText("Net payout ₹1,463.00");
    await expect(page.getByRole("tab", { name: "All 2" })).toBeVisible();
    await expect(page.getByText(run.donorOne)).toBeVisible();
    await expect(page.getByText(run.donorTwo)).toBeVisible();
    const importUnknown = page.getByRole("switch", {
      name: "Import unknown donations",
    });
    await importUnknown.click();
    await expect(importUnknown).toBeChecked();
    await page.getByRole("button", { name: "Import payout" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Payout imported. 2 donations imported and 0 linked.",
      { timeout: 20_000 }
    );

    await page.getByRole("link", { name: "View settlements" }).click();
    await waitForZeroReady(page);
    await page
      .getByPlaceholder("Search provider, settlement ID or UTR...")
      .fill(run.utr);
    const settlement = page.getByRole("row").filter({ hasText: run.utr });
    await expect(settlement).toHaveCount(1, { timeout: 15_000 });
    await expect(settlement).toContainText("give.do");
    await expect(settlement).toContainText("₹1,500.00");
    await expect(settlement).toContainText("₹37.00");
    await expect(settlement).toContainText("₹1,463.00");
    await settlement.getByText(run.utr).click();
    const breakdown = page.getByTestId("settlement-breakdown");
    await expect(breakdown).toContainText("Payments (2)");
    await expect(breakdown).toContainText("₹1,500.00");
    await expect(breakdown).toContainText("− ₹37.00");
    await expect(breakdown).toContainText("= ₹1,463.00");
    const lines = page.getByTestId("settlement-lines");
    await expect(lines).toContainText(run.donorOne);
    await expect(lines).toContainText(run.donorTwo);
    await expect(lines).toContainText(`LC${run.id}1`);
    await expect(lines).toContainText(`LC${run.id}2`);
    await page.keyboard.press("Escape");

    for (const donor of [run.donorOne, run.donorTwo]) {
      const detail = await openContribution(page, donor);
      await expect(detail.getByTestId("contribution-settled")).toContainText(
        "Settled on"
      );
      await expect(detail.getByTestId("contribution-settled")).toContainText(
        `(UTR ${run.utr})`
      );
      await page.keyboard.press("Escape");
    }

    await page.goto(bankUrl);
    await waitForZeroReady(page);
    await page.getByRole("tab", { name: "Matched 1" }).click();
    const line = page.getByTestId("statement-line").filter({
      hasText: run.utr,
    });
    await expect(line).toContainText("give.do settlement");
    await expect(line).toContainText("UTR matches");

    const evidenceGate = Promise.withResolvers<void>();
    let evidenceRequested = false;
    await page.route("**/_serverFn/**", async (route) => {
      if (route.request().postData()?.includes("contributionIds")) {
        evidenceRequested = true;
        await evidenceGate.promise;
      }
      await route.continue();
    });
    await page.goto("/income");
    await waitForZeroReady(page);
    await page.getByPlaceholder("Search donor or reference...").fill(run.id);
    await expect(
      page.getByRole("row").filter({ hasText: run.donorOne })
    ).toHaveCount(1);
    expect(evidenceRequested).toBe(false);
    await applyQuickFilter(page, "Reached bank", "Yes");
    await expect.poll(() => evidenceRequested).toBe(true);
    await expect(
      page.getByRole("status").filter({ hasText: "Loading bank status..." })
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: run.donorOne })
    ).toHaveCount(0);
    evidenceGate.resolve();
    await expect(
      page.getByRole("row").filter({ hasText: run.donorOne })
    ).toHaveCount(1, { timeout: 15_000 });
    await expect(
      page.getByRole("row").filter({ hasText: run.donorTwo })
    ).toHaveCount(1);

    await page.goto("/income");
    await waitForZeroReady(page);
    await page.getByPlaceholder("Search donor or reference...").fill(run.id);
    await applyQuickFilter(page, "Reached bank", "Not yet");
    await expect(page.getByText("Loading bank status...")).toHaveCount(0);
    await expect(
      page.getByRole("row").filter({ hasText: run.donorOne })
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(
      page.getByRole("row").filter({ hasText: run.donorTwo })
    ).toHaveCount(0);

    await page.unroute("**/_serverFn/**");
    await uploadPayout(page, run);
    await expect(page.getByRole("status")).toContainText(
      "Already imported. This UTR already has a settlement; importing again creates no duplicates."
    );
    await page.getByRole("button", { name: "Import payout" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Already imported. No duplicates created.",
      { timeout: 20_000 }
    );
    await page.getByRole("link", { name: "View settlements" }).click();
    await waitForZeroReady(page);
    await page
      .getByPlaceholder("Search provider, settlement ID or UTR...")
      .fill(run.utr);
    await expect(
      page.getByRole("row").filter({ hasText: run.utr })
    ).toHaveCount(1, { timeout: 15_000 });
  });

  test("a donor-only role cannot open the payout importer", async ({
    baseURL,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    const { stdout } = await execFileAsync(
      "bun",
      [
        "run",
        path.resolve(import.meta.dirname, "../../helpers/razorpay.ts"),
        "donors-viewer",
      ],
      { env: process.env }
    );
    const viewer = JSON.parse(stdout.trim()) as {
      email: string;
      password: string;
    };
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email").fill(viewer.email);
      await page.getByLabel("Password").fill(viewer.password);
      await page.getByRole("button", { exact: true, name: "Log in" }).click();
      await page.waitForURL((url) => url.pathname !== "/login");

      await page.goto("/income/payout/import");
      await expect(page).not.toHaveURL(/\/income\/payout\/import/);
      await page.goto("/income");
      await waitForZeroReady(page);
      await page.getByRole("button", { name: "More actions" }).click();
      await expect(
        page.getByRole("menuitem", { name: "Import give.do payout" })
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
