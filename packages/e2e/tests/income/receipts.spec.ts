import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { Browser, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickUntilDialogCloses } from "../../helpers/dialog-submit";

const RECEIPT_DONOR = "E2E Receipt Donor";
const UPI_REFERENCE = "E2E-RECEIPT-UPI";
const GIVE_DO_REFERENCE = "E2E-RECEIPT-GIVEDO";
const RAZORPAY_REFERENCE = "E2E-RECEIPT-RAZORPAY";
const DETAILS_DONOR = "E2E Receipt Details Donor";
const DETAILS_REFERENCE = "E2E-RECEIPT-DETAILS";

/** The financial year running now in India, whose series the receipt starts. */
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

/** Receipts need the 80G registration; enter it if the run hasn't yet. */
async function ensureRegistration(page: Page) {
  await page.goto("/settings/org-accounts");
  await waitForZeroReady(page);
  await expect(
    page.getByRole("region", { name: "Donation receipts" })
  ).toContainText("UPI, NEFT/IMPS, cheque, cash");
  await expect(
    page.getByRole("region", { name: "Donation receipts" })
  ).toContainText("E2E Test Trust");
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

const execFileAsync = promisify(execFile);

/** Clears the details donor's address, so the test starts from Needs details. */
async function clearDetailsAddress(): Promise<void> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/receipts.ts"),
      "clear-details-address",
    ],
    { env: process.env }
  );
  const { cleared } = JSON.parse(stdout.trim()) as { cleared: number };
  if (cleared !== 1) {
    throw new Error("The receipt details donor isn't seeded");
  }
}

/** The signed path a receipt's QR code opens. */
async function verifyPath(receiptId: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/receipts.ts"),
      "verify-path",
      receiptId,
    ],
    { env: process.env }
  );
  return (JSON.parse(stdout.trim()) as { path: string }).path;
}

/** Opens a verification link signed out, as someone scanning a printed receipt would. */
async function openSignedOut(
  browser: Browser,
  baseURL: string | undefined,
  link: string
): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto(link);
  return page;
}

/** The table row of one of the receipt donor's gifts, by its reference. */
async function giftRow(
  page: Page,
  reference: string,
  receiptFilter?: string,
  donor = RECEIPT_DONOR
) {
  const filters = receiptFilter
    ? `&filters=${encodeURIComponent(
        JSON.stringify({
          combinator: "and",
          id: "root",
          rules: [
            {
              id: "receipt",
              operator: "is",
              path: ["receipt"],
              type: "rule",
              value: [receiptFilter],
            },
          ],
          type: "group",
        })
      )}`
    : "";
  await page.goto(`/income?search=${encodeURIComponent(reference)}${filters}`);
  await waitForZeroReady(page);
  return page.getByRole("row").filter({ hasText: donor });
}

async function openGift(page: Page, reference: string) {
  await page.goto("/income");
  await waitForZeroReady(page);
  await page.getByPlaceholder("Search donor or reference...").fill(reference);
  await page
    .getByRole("row")
    .filter({ hasText: RECEIPT_DONOR })
    .first()
    .click();
  const sheet = page.getByRole("dialog").filter({ hasText: RECEIPT_DONOR });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("Income: donation receipts (finance)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "finance_admin",
      "Needs donors.receipt (finance admins and super admins)"
    );
    test.skip(
      !process.env.DATA_ENCRYPTION_KEY,
      "The receipt donor's PAN needs DATA_ENCRYPTION_KEY"
    );
  });

  test("never offers a receipt for a give.do gift", async ({ page }) => {
    const sheet = await openGift(page, GIVE_DO_REFERENCE);
    await expect(sheet.getByTestId("contribution-receipt")).toHaveText(
      "Receipted by give.do"
    );
    await expect(sheet.getByTestId("contribution-issue-receipt")).toHaveCount(
      0
    );
  });

  test("shows who receipts gateway gifts in the Receipt column", async ({
    page,
  }) => {
    const razorpay = await giftRow(page, RAZORPAY_REFERENCE);
    await expect(razorpay.getByTestId("contribution-receipt-cell")).toHaveText(
      "By Razorpay"
    );
    await expect(razorpay.getByTestId("contribution-status")).toHaveText(
      "Received"
    );
    const giveDo = await giftRow(page, GIVE_DO_REFERENCE);
    await expect(giveDo.getByTestId("contribution-receipt-cell")).toHaveText(
      "By give.do"
    );
  });

  test("replaces the signatory's signature in Settings", async ({ page }) => {
    await page.goto("/settings/org-accounts");
    await waitForZeroReady(page);
    const receipts = page.getByRole("region", { name: "Donation receipts" });
    await receipts
      .getByRole("button", { name: "Edit receipt details" })
      .click();
    // The stored signature previews from storage before it is replaced.
    const preview = receipts.getByRole("img", {
      name: "Signatory's signature",
    });
    await expect
      .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await receipts
      .getByLabel("Signatory's signature")
      .setInputFiles(
        path.resolve(
          import.meta.dirname,
          "../../fixtures/images/receipt-signature.png"
        )
      );
    await expect(preview).toHaveAttribute("src", /^blob:/);
    await receipts
      .getByRole("button", { name: "Save receipt details" })
      .click();
    await expect(page.getByText("Receipt details saved")).toBeVisible({
      timeout: 15_000,
    });
    await expect(receipts).toContainText("signed by E2E Signatory");
  });

  test("issues, downloads, verifies and voids a receipt for a direct gift", async ({
    baseURL,
    browser,
    page,
  }, testInfo) => {
    test.slow();
    const fy = currentFinancialYear();
    await ensureRegistration(page);

    // The table: Ready to issue, and the Receipt filter lists it alone of
    // the donor's gifts (the gateway gifts are receipted by the gateway).
    const ready = await giftRow(page, "E2E-RECEIPT", "ready");
    await expect(ready).toHaveCount(1, { timeout: 15_000 });
    await expect(ready.getByTestId("contribution-receipt-cell")).toHaveText(
      "Ready to issue"
    );
    await expect(ready.getByTestId("contribution-status")).toHaveText(
      "Received"
    );
    const byRazorpay = await giftRow(page, "E2E-RECEIPT", "razorpay");
    await expect(byRazorpay).toHaveCount(1, { timeout: 15_000 });
    await expect(
      byRazorpay.getByTestId("contribution-receipt-cell")
    ).toHaveText("By Razorpay");

    // The bulk review lists the gift as ready.
    await page.goto("/income?tab=receipts");
    await waitForZeroReady(page);
    await page.getByTestId("issue-receipts").click();
    const review = page.getByRole("dialog", { name: "Issue receipts" });
    await expect(review.getByTestId("receipts-to-issue")).toContainText(
      RECEIPT_DONOR,
      { timeout: 15_000 }
    );
    await review.getByRole("button", { name: "Cancel" }).click();

    // Issue just this gift from its sheet.
    const sheet = await openGift(page, UPI_REFERENCE);
    await sheet
      .getByTestId("contribution-issue-receipt")
      .click({ timeout: 15_000 });
    const single = page.getByRole("dialog", { name: "Issue receipts" });
    await expect(single.getByTestId("receipts-to-issue")).toContainText(
      RECEIPT_DONOR
    );
    await single.getByRole("button", { name: "Issue 1 receipt" }).click();
    await expect(single).toBeHidden({ timeout: 15_000 });
    const receiptLine = sheet.getByTestId("contribution-receipt");
    await expect(receiptLine).toContainText(`PI/${fy}/`, { timeout: 15_000 });
    const number = (
      (await receiptLine.locator(".font-mono").textContent()) ?? ""
    ).trim();
    expect(number).toMatch(new RegExp(`^PI/${fy}/\\d{4}$`));
    if (testInfo.retry === 0) {
      expect(number).toBe(`PI/${fy}/0001`);
    }
    // Status is the money's lifecycle only; receipting has its own column.
    await expect(sheet.getByTestId("contribution-status")).toHaveText(
      "Received"
    );

    // The PDF opens in the viewer, which downloads it named after the number.
    await receiptLine.getByRole("button", { name: "View" }).click();
    const viewer = page.getByRole("dialog", { name: `Receipt ${number}` });
    await expect(viewer.getByText("1 page")).toBeVisible({ timeout: 15_000 });
    await expect(viewer.getByRole("group", { name: "Page 1" })).toBeVisible();
    // The page's text is selectable and searchable, not only drawn.
    await expect(
      viewer
        .getByRole("group", { name: "Page 1" })
        .getByText(number, { exact: true })
    ).toBeAttached();
    const downloadPromise = page.waitForEvent("download");
    await viewer.getByRole("button", { name: "Download" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      `${number.replaceAll("/", "-")}.pdf`
    );
    const href = await viewer
      .getByRole("link", { name: "Open in new tab" })
      .getAttribute("href");
    await viewer.getByRole("button", { name: "Close" }).click();
    await expect(viewer).toBeHidden();
    const response = await page.request.get(href ?? "");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    const body = (await response.body()).toString("latin1");
    expect(body.startsWith("%PDF-")).toBe(true);
    expect(body).toContain(`(${number})`);
    // Every fetch serves the one stored file.
    const downloadPath = await download.path();
    const downloaded = await readFile(downloadPath);
    const sha = (bytes: Buffer) =>
      createHash("sha256").update(bytes).digest("hex");
    expect(sha(await response.body())).toBe(sha(downloaded));

    // The QR code's link confirms the receipt to anyone, with the donor masked.
    const receiptId = new URL(href ?? "", page.url()).pathname
      .split("/")
      .at(-1);
    const link = await verifyPath(receiptId ?? "");
    const verifier = await openSignedOut(browser, baseURL, link);
    await expect(
      verifier.getByRole("heading", { name: "Genuine receipt" })
    ).toBeVisible({ timeout: 15_000 });
    const details = verifier.getByRole("region", { name: "Receipt details" });
    await expect(details).toContainText(number);
    await expect(details).toContainText("E••• R••• D•••");
    await expect(details).not.toContainText(RECEIPT_DONOR);
    await expect(details).toContainText("Eligible");
    // The donor's PDF checks out byte for byte; an edited copy doesn't.
    const pdfCheck = verifier.getByLabel("Receipt PDF to check");
    await pdfCheck.setInputFiles(downloadPath);
    await expect(verifier.getByRole("status").last()).toHaveText(
      "This is the exact file Proud Indian issued."
    );
    const edited = Buffer.from(downloaded);
    edited[edited.length - 20] = (edited[edited.length - 20] ?? 0) ^ 1;
    await pdfCheck.setInputFiles({
      buffer: edited,
      mimeType: "application/pdf",
      name: "edited.pdf",
    });
    await expect(verifier.getByRole("status").last()).toContainText(
      "isn't the exact file Proud Indian issued"
    );
    // A link with another signature verifies nothing.
    const tampered = await verifier.goto(
      `${link.slice(0, -1)}${link.endsWith("A") ? "B" : "A"}`
    );
    expect(tampered?.status()).toBe(404);
    await expect(
      verifier.getByRole("heading", { name: "We couldn't verify this receipt" })
    ).toBeVisible();
    await expect(verifier.getByText(number)).toHaveCount(0);

    // The table shows the number, still Received, and the Issued filter finds it.
    await page.keyboard.press("Escape");
    const issued = await giftRow(page, UPI_REFERENCE, "issued");
    await expect(issued).toHaveCount(1, { timeout: 15_000 });
    await expect(issued.getByTestId("contribution-receipt-cell")).toHaveText(
      number
    );
    await expect(issued.getByTestId("contribution-status")).toHaveText(
      "Received"
    );

    // The number opens the viewer over the table. Downloading from the
    // keyboard and closing it by clicking outside never open the gift's sheet.
    await issued.getByTestId("contribution-receipt-cell").click();
    const fromTable = page.getByRole("dialog", { name: `Receipt ${number}` });
    await expect(fromTable.getByRole("group", { name: "Page 1" })).toBeVisible({
      timeout: 15_000,
    });
    const keyboardDownload = page.waitForEvent("download");
    await fromTable.getByRole("button", { name: "Download" }).focus();
    await page.keyboard.press("Enter");
    expect((await keyboardDownload).suggestedFilename()).toBe(
      `${number.replaceAll("/", "-")}.pdf`
    );
    await page.mouse.click(5, 5);
    await expect(fromTable).toBeHidden();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Void it from the Receipts tab; the number stays in the list.
    await page.goto("/income?tab=receipts");
    await waitForZeroReady(page);
    await page.getByPlaceholder("Search number or donor...").fill(number);
    const row = page.getByRole("row").filter({ hasText: number });
    await expect(row.getByTestId("receipt-status")).toHaveText("Issued");
    await row.click();
    const receiptSheet = page.getByRole("dialog").filter({ hasText: number });
    await receiptSheet.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Void receipt" }).click();
    const voidDialog = page.getByRole("dialog", {
      name: `Void receipt ${number}`,
    });
    await voidDialog
      .getByRole("textbox", { name: "Reason" })
      .fill("Issued to the wrong donor in the test");
    await clickUntilDialogCloses(voidDialog, "Void receipt");
    await expect(receiptSheet.getByTestId("receipt-status")).toHaveText(
      "Voided",
      { timeout: 15_000 }
    );
    await expect(receiptSheet).toContainText(
      "Issued to the wrong donor in the test"
    );
    await page.keyboard.press("Escape");
    await expect(row.getByTestId("receipt-status")).toHaveText("Voided");

    // The same link now says the receipt was cancelled.
    await verifier.goto(link);
    await expect(
      verifier.getByRole("heading", { name: "Cancelled receipt" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      verifier.getByRole("region", { name: "Receipt details" })
    ).toContainText(number);
    await verifier.context().close();

    // The table shows it Ready to issue again.
    const again = await giftRow(page, UPI_REFERENCE);
    await expect(again.getByTestId("contribution-receipt-cell")).toHaveText(
      "Ready to issue",
      { timeout: 15_000 }
    );

    // The gift is Received again and can be receipted under a new number.
    const reopened = await openGift(page, UPI_REFERENCE);
    await expect(reopened.getByTestId("contribution-status")).toHaveText(
      "Received"
    );
    await expect(
      reopened.getByTestId("contribution-issue-receipt")
    ).toBeVisible({ timeout: 15_000 });
  });

  test("a gift waiting on the donor's address is Ready to issue once it is added", async ({
    page,
  }) => {
    test.slow();
    // Self-resetting: a retry finds the address the last attempt added.
    await clearDetailsAddress();
    const row = await giftRow(
      page,
      DETAILS_REFERENCE,
      undefined,
      DETAILS_DONOR
    );
    await expect(row.getByTestId("contribution-receipt-cell")).toHaveText(
      "Needs details",
      { timeout: 15_000 }
    );
    await expect(
      (
        await giftRow(page, "E2E-RECEIPT", "needs_details", DETAILS_DONOR)
      ).getByTestId("contribution-receipt-cell")
    ).toHaveText("Needs details", { timeout: 15_000 });

    // Add the address on the donor.
    await page.goto("/donors");
    await waitForZeroReady(page);
    await page.getByPlaceholder("Search donors...").fill(DETAILS_DONOR);
    await page
      .getByRole("row")
      .filter({ hasText: DETAILS_DONOR })
      .first()
      .click();
    const sheet = page.getByRole("dialog").filter({ hasText: DETAILS_DONOR });
    await sheet.getByRole("button", { name: "Edit" }).click();
    const form = page.getByRole("dialog", { name: "Edit donor" });
    await expect(form).toBeVisible();
    await form
      .getByRole("textbox", { name: "Address line 1" })
      .fill("9, Test Road");
    await form.getByRole("textbox", { name: "PIN code" }).fill("560002");
    await clickUntilDialogCloses(form, "Save changes");
    await page.keyboard.press("Escape");

    const ready = await giftRow(
      page,
      DETAILS_REFERENCE,
      undefined,
      DETAILS_DONOR
    );
    await expect(ready.getByTestId("contribution-receipt-cell")).toHaveText(
      "Ready to issue",
      { timeout: 15_000 }
    );
  });
});
