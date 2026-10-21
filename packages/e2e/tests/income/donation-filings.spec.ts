import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickUntilDialogCloses } from "../../helpers/dialog-submit";

/**
 * A donations return filing end to end: record it (freezing every ready
 * gift of the year), record the portal's acknowledgement, upload a ZIP of
 * synthetic Form 114 certificates, and email them. Recording a filing
 * freezes gifts every other spec relies on, so this runs in
 * `exclusive_last`, as super admin; each attempt starts with no filings.
 * Email is captured as queued jobs: E2E has no Resend key.
 */

const READY_DONOR = "E2E Ready Donor";
/** Seeded encrypted for the ready donor (see seed-test-user.ts). */
const READY_DONOR_PAN = "AAAPE1234E";

const execFileAsync = promisify(execFile);

async function helper<T>(...args: string[]): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/donation-filings.ts"),
      ...args,
    ],
    { env: process.env, maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(stdout.trim()) as T;
}

/** The financial year running now in India, which holds the seeded gifts. */
function currentFinancialYear(): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(new Date());
  const year = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** The upload file needs the 80G registration; enter it if the run hasn't. */
async function ensureRegistration(page: Page) {
  await page.goto("/settings/org-accounts");
  await waitForZeroReady(page);
  await expect(
    page.getByRole("button", { name: "Edit 80G registration" })
  ).toBeVisible();
  if (await page.getByText(/^URN /).isVisible()) {
    return;
  }
  await page.getByRole("button", { name: "Edit 80G registration" }).click();
  await page
    .getByRole("textbox", { name: "Unique Registration Number (URN)" })
    .fill("AAATP1234AF20214");
  await page
    .getByRole("button", { exact: true, name: "Date of issue" })
    .click();
  const calendar = page.getByRole("dialog").last();
  await calendar.locator("button[data-day]").first().click();
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.getByRole("button", { name: "Save registration" }).click();
  await expect(page.getByText(/^URN /)).toBeVisible({ timeout: 10_000 });
}

test.describe("Donations return filings", () => {
  test.beforeEach(() => {
    test.skip(
      Boolean(process.env.CI),
      "Recording a filing keeps its file in R2, which CI does not have"
    );
    test.skip(
      !process.env.DATA_ENCRYPTION_KEY,
      "The ready donor's PAN needs DATA_ENCRYPTION_KEY"
    );
  });

  test("records a filing, matches the portal's certificates and emails them", async ({
    page,
  }) => {
    test.slow();
    const fy = currentFinancialYear();
    await helper("reset");
    await ensureRegistration(page);

    await page.goto(`/income/return?fy=${fy}`);
    await waitForZeroReady(page);
    await expect(page.getByTestId("return-progress")).toBeVisible({
      timeout: 15_000,
    });

    // Record with Pre-ARNs pasted from the portal (fake ones): the upload
    // file downloads with one on every row, in Sr. No. order.
    await page.getByRole("button", { name: "Record filing" }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "From the portal" }).click();
    const prefix = `E2EPRE${Date.now().toString(36).toUpperCase()}`;
    await confirm
      .getByRole("textbox", { name: "Portal Pre-ARNs" })
      .fill(
        Array.from(
          { length: 10 },
          (_, index) => `${prefix}${String(index + 1).padStart(3, "0")}`
        ).join("\n")
      );
    const downloadPromise = page.waitForEvent("download");
    await confirm.getByRole("button", { name: "Record filing" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      `donations-return-FY${fy}-filing-1.csv`
    );
    const [header, ...lines] = (
      await readFile(await download.path(), "utf8")
    ).split("\n");
    expect(header?.startsWith("Sr. No.,Pre Acknowledgement Number,")).toBe(
      true
    );
    expect(lines[0]?.startsWith(`1,${prefix}001,`)).toBe(true);
    const readyLine = lines.find((line) => line.includes(READY_DONOR));
    expect(readyLine).toMatch(
      new RegExp(
        `^\\d+,${prefix}\\d{3},Permanent Account Number,${READY_DONOR_PAN},`
      )
    );

    // The new filing opens; its gifts now count as filed.
    const sheet = page.getByRole("dialog").filter({ hasText: "Filing 1" });
    await expect(sheet.getByText("Not uploaded yet")).toBeVisible();
    await expect(
      sheet.getByTestId("filing-row").filter({ hasText: READY_DONOR })
    ).toContainText("No certificate yet");

    // Record what the portal gave back.
    await sheet.getByRole("button", { name: "Record submission" }).click();
    const form = page.getByRole("dialog", {
      name: "Record submission of filing 1",
    });
    // Today: the calendar opens on the current month. A plain date picker
    // closes itself on a pick, so no Escape (it would close the form too).
    await form.getByRole("button", { exact: true, name: "Filed on" }).click();
    await page
      .getByRole("dialog")
      .last()
      .locator(`button[data-day="${new Date().toLocaleDateString("en-US")}"]`)
      .click();
    await form
      .getByRole("textbox", { name: "Acknowledgement number" })
      .fill("E2E113ACK0001");
    await form
      .getByRole("textbox", { name: "Transaction ID" })
      .fill("E2ETXN01");
    await clickUntilDialogCloses(form, "Save submission");
    await expect(sheet.getByText("E2E113ACK0001")).toBeVisible({
      timeout: 15_000,
    });

    // Upload the portal's ZIP: every row matches, the stray file doesn't.
    const filing = await helper<{ id: string; sequence: number }>("latest", fy);
    const zip = await helper<{ base64: string; rowCount: number }>(
      "certificates",
      filing.id
    );
    await sheet.getByRole("button", { name: "Upload certificates" }).click();
    const upload = page.getByRole("dialog", {
      name: "Upload certificates for filing 1",
    });
    await upload.getByTestId("certificate-file-input").setInputFiles({
      buffer: Buffer.from(zip.base64, "base64"),
      mimeType: "application/zip",
      name: "Form114.zip",
    });
    await upload.getByRole("button", { name: "Upload certificates" }).click();
    const result = upload.getByTestId("certificate-upload-result");
    // The first row's certificate has no Pre-ARN: matched by details, it
    // waits for review.
    await expect(
      result.getByRole("region", { exact: true, name: "Matched" })
    ).toContainText(`Matched (${zip.rowCount - 1})`, { timeout: 30_000 });
    await expect(
      result.getByRole("region", { name: "Needs review" })
    ).toContainText("Needs review (1)");
    await expect(
      result.getByRole("region", { name: "Not matched" })
    ).toContainText("stray.pdf");
    await upload.getByRole("button", { name: "Done" }).click();
    const review = sheet.getByTestId("filing-row-review");
    await expect(review).toHaveCount(1);
    await expect(review).toContainText("ending");
    await review.getByRole("button", { name: "Confirm match" }).click();
    await expect(page.getByText("Certificate confirmed")).toBeVisible();
    await expect(sheet.getByTestId("filing-row-review")).toHaveCount(0);
    const readyRow = sheet
      .getByTestId("filing-row")
      .filter({ hasText: READY_DONOR });
    await expect(readyRow.getByTestId("filing-row-status")).toHaveText(
      "Certificate ready"
    );

    // Email: one job per certificate with an address, captured not sent.
    await sheet.getByRole("button", { name: "Email certificates" }).click();
    const emailConfirm = page.getByRole("alertdialog");
    await emailConfirm
      .getByRole("button", { name: "Email certificates" })
      .click();
    await expect(page.getByText(/queued for email/)).toBeVisible();
    await expect(readyRow.getByTestId("filing-row-status")).toHaveText(
      /Sending|Email isn't set up/
    );
    const jobs = await helper<{ certificates: number; jobs: number }>(
      "email-jobs",
      filing.id
    );
    expect(jobs.certificates).toBe(zip.rowCount);
    expect(jobs.jobs).toBeGreaterThan(0);
  });
});
