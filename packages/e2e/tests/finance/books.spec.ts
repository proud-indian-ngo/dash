import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Locator, Page } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { clickUntilDialogCloses } from "../../helpers/dialog-submit";
import { clickPageAction, openPageAction } from "../../helpers/page-header";
import {
  ApprovalDetailPage,
  PAYMENT_SCREENSHOT_FIXTURE,
} from "../../pages/approval-detail-page";
import { ListPage } from "../../pages/list-page";

/*
 * The books (finance Phase 3, layer 1): opening balances, the books views
 * and year close. Amounts are fake; the real figures are only ever typed in
 * by the treasurer.
 */

const YEAR = "2026-27";

/** The April-to-March year a day (yyyy-MM-dd) falls in, as "2026-27". */
const financialYearOf = (iso: string) => {
  const year = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
};
/** The year before a label: "2025-26" for "2026-27". */
const yearBefore = (label: string) =>
  financialYearOf(`${Number(label.slice(0, 4)) - 1}-04-01`);
/** Today in India (yyyy-MM-dd). */
const todayInIndia = () =>
  new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const execFileAsync = promisify(execFile);

/** Paise as the plain rupee text the inputs take ("-12.50"). */
const rupeesText = (paise: number) => {
  const abs = Math.abs(paise);
  return `${paise < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};
const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", { currency: "INR", style: "currency" }).format(
    paise / 100
  );

/** Runs a step of `helpers/books.ts` against the test database. */
async function books<T = Record<string, string>>(
  ...args: string[]
): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/books.ts"),
      ...args,
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

/** An account in the books' accounts rail, by name. */
const railAccount = (page: Page, name: string) =>
  page.getByTestId("books-account").filter({ hasText: name });

async function postPending(page: Page) {
  await clickPageAction(page, "Post pending");
  await expect(
    page.getByText(/^(Posted: |The books are up to date)/).first()
  ).toBeVisible({ timeout: 30_000 });
}

/** Post pending from the Books page (other pages' tests start elsewhere). */
async function postPendingFromBooks(page: Page) {
  await page.goto("/finance/books");
  await waitForZeroReady(page);
  await postPending(page);
}

/** The reimbursements list, searched down to one title. */
async function findInList(page: Page, title: string) {
  await page.goto("/reimbursements");
  await waitForZeroReady(page);
  await page.getByPlaceholder("Search reimbursements...").fill(title);
  return new ListPage(page).getRowByText(title);
}

async function openWaitingList(page: Page) {
  await page
    .getByTestId("waiting-to-post")
    .getByRole("button", { name: "Show" })
    .click();
  await expect(page.getByTestId("waiting-list")).toBeVisible({
    timeout: 15_000,
  });
}

async function pickOption(
  scope: Locator,
  page: Page,
  label: string,
  text: string
) {
  const combobox = scope.getByRole("combobox", { name: label });
  await combobox.click();
  await combobox.fill(text);
  const option = page.getByRole("option").filter({ hasText: text }).first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

async function reverseIfPosted(page: Page) {
  await page.goto("/finance/books/opening");
  await waitForZeroReady(page);
  const view = page.getByTestId("opening-view");
  const form = page.getByRole("button", { name: "Post opening balances" });
  await expect(view.or(form)).toBeVisible({ timeout: 15_000 });
  if (await view.isVisible()) {
    await clickPageAction(page, "Reverse opening balances");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason").fill("E2E rerun starts clean");
    await dialog
      .getByRole("button", { name: "Reverse opening balances" })
      .click();
    await expect(form).toBeVisible({ timeout: 15_000 });
  }
}

test.describe("Books (treasurer)", () => {
  test.describe.configure({ mode: "serial" });

  test("posts balanced opening balances, refuses unbalanced ones, keeps a running year open and reopens a closed one", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Treasurer test");
    await reverseIfPosted(page);

    await page.getByLabel("E2E Bank Account (₹)").fill("1000");
    await page.getByLabel("E2E Fixed deposit (₹)").fill("2000");
    await page
      .getByLabel("Asset 1", { exact: true })
      .fill("E2E sewing machine");
    await page.getByLabel("Asset 1 amount (₹)").fill("50");
    await page
      .getByLabel("Liability 1", { exact: true })
      .fill("E2E audit fees payable");
    await page.getByLabel("Liability 1 amount (₹)").fill("100");
    await page.getByLabel("Corpus Fund (₹)").fill("10");
    await page.getByLabel("General Fund (Domestic) (₹)").fill("2900");
    await page.getByLabel("Chartered accountant").fill("E2E Test CA");
    await pickDate(page.locator("main"), "Confirmed on", new Date());
    await page
      .getByRole("switch", { name: "The CA has confirmed these figures" })
      .click();

    // Unbalanced: 3,050 of assets against 3,010 of funds and liabilities.
    const check = page.getByTestId("opening-check");
    await expect(check).toContainText("Off by ₹40.00");
    const post = page.getByRole("button", { name: "Post opening balances" });
    await expect(post).toBeDisabled();

    await page.getByLabel("General Fund (Domestic) (₹)").fill("2940");
    await expect(check).toContainText("Balances");
    await expect(post).toBeEnabled();
    await post.click();
    await expect(page.getByText("Opening balances posted")).toBeVisible();

    // The balance summary agrees with the document.
    await expect(page).toHaveURL(/\/finance\/books\?tab=balance/);
    await waitForZeroReady(page);
    await expect(page.getByTestId("balance-check")).toHaveText("Balances");
    // Income from other specs posts too (layer 3-2), so the asset and fund
    // totals move with it; the liabilities are the document's alone.
    await expect(page.getByTestId("balance-liabilities-total")).toHaveText(
      "₹100.00"
    );

    // The fixed deposit's cash book opens with its opening movement.
    await page
      .getByTestId("books-account")
      .filter({ hasText: "E2E Fixed deposit" })
      .click();
    const cashBook = page.getByTestId("cash-book");
    await expect(
      cashBook.getByRole("row").filter({ hasText: "Opening" }).first()
    ).toContainText("₹2,000.00");
    // (Its rail balance isn't checked: a transfer test may already have
    // moved money into the FD in this database.)

    // A running year can't be closed: the checklist says why.
    await clickPageAction(page, `Close ${YEAR}`);
    const closeDialog = page.getByRole("dialog");
    await expect(
      closeDialog.getByTestId("close-check-opening_balances")
    ).toHaveAttribute("data-ok", "true");
    await expect(
      closeDialog.getByTestId("close-check-year_ended")
    ).toHaveAttribute("data-ok", "false");
    await expect(
      closeDialog.getByTestId("close-check-clearing_balances")
    ).toContainText("payouts in transit are normal");
    await expect(
      closeDialog.getByRole("button", { name: `Close ${YEAR}` })
    ).toBeDisabled();
    await closeDialog.getByRole("button", { name: "Cancel" }).click();

    // Closed after year end (by the real close, run as of that day), the
    // year reopens here with a reason.
    try {
      await books("close-year", YEAR);

      // The database itself refuses edits to the posted books
      // (with a close event to protect too).
      const guards = await books("probe-guards");
      expect(guards).toEqual(
        Object.fromEntries(Object.keys(guards).map((key) => [key, "refused"]))
      );
      expect(Object.keys(guards).length).toBeGreaterThan(5);

      await page.reload();
      await waitForZeroReady(page);
      await expect(page.getByTestId("year-status")).toHaveText("Closed");
      await expect(page.getByTestId("year-history")).toContainText("Closed");
      await clickPageAction(page, `Reopen ${YEAR}`);
      const reopenDialog = page.getByRole("dialog");
      await reopenDialog
        .getByLabel("Reason")
        .fill("E2E: CA asked for a correction");
      await reopenDialog
        .getByRole("button", { name: `Reopen ${YEAR}` })
        .click();
      await expect(page.getByText(`${YEAR} reopened`)).toBeVisible();
      await expect(page.getByTestId("year-status")).toHaveText("Open");
      await expect(page.getByTestId("year-history")).toContainText(
        "E2E: CA asked for a correction"
      );
    } finally {
      // Never leave the shared test database with a closed year.
      await books("reopen-year", YEAR);
    }

    // The posted document is read-only.
    await page.goto("/finance/books/opening");
    await waitForZeroReady(page);
    await expect(page.getByTestId("opening-view")).toContainText(
      "E2E sewing machine"
    );
    await expect(
      page.getByRole("button", { name: "Post opening balances" })
    ).toHaveCount(0);
  });

  // Income posting (layer 3-2). In the same serial group as the year close
  // above: both close and reopen the shared 2026-27.
  test("posts a gift with its fee, its payout and a transfer to the FD, and follows a programme edit", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Treasurer test");
    test.setTimeout(120_000);
    // Self-sufficient: CI shards may run this without the test above.
    await books("ensure-opening", YEAR);
    const run = `${Date.now()}${testInfo.retry}`;
    const fixture = await books("income-fixture", run);

    await page.goto("/finance/books");
    await waitForZeroReady(page);
    await postPending(page);

    // The gift went into clearing gross, the fee and the payout came out:
    // clearing is back at zero and the bank holds the net and the UPI gift.
    await expect(
      railAccount(page, fixture.clearingName).getByTestId(
        "books-account-balance"
      )
    ).toHaveText("₹0.00", { timeout: 15_000 });
    await expect(
      railAccount(page, fixture.bankName).getByTestId("books-account-balance")
    ).toHaveText("₹1,476.40");
    await railAccount(page, fixture.clearingName).click();
    const cashBook = page.getByTestId("cash-book");
    await expect(
      cashBook.getByRole("row").filter({ hasText: "Receipt" })
    ).toContainText("₹1,000.00");
    await expect(
      cashBook.getByRole("row").filter({ hasText: "Fee" })
    ).toContainText("₹23.60");
    await expect(
      cashBook.getByRole("row").filter({ hasText: "Transfer" })
    ).toContainText("₹976.40");

    // The line links back to its gift, whose sheet says it is in the books.
    // On a narrow screen the table is compact: expand the row first.
    const receipt = cashBook.getByRole("row").filter({ hasText: "Receipt" });
    const expand = receipt.getByRole("button", { name: "Expand row" });
    if (await expand.isVisible()) {
      await expand.click();
    }
    await cashBook.getByRole("link", { name: "Contribution" }).first().click();
    await expect(page).toHaveURL(/contribution=/);
    await expect(page.getByTestId("in-the-books")).toContainText("posted", {
      timeout: 15_000,
    });

    // A transfer from the bank to the fixed deposit posts both legs.
    await page.goto(`/income/bank?account=${fixture.bankId}&tab=out`);
    await waitForZeroReady(page);
    const debit = page
      .getByTestId("statement-line")
      .filter({ hasText: "₹300.00" });
    await expect(debit).toBeVisible({ timeout: 15_000 });
    await debit.getByRole("button", { name: "Line actions" }).click();
    await page.getByRole("menuitem", { name: "Mark as transfer" }).click();
    const transfer = page.getByRole("dialog", { name: "Mark as transfer" });
    await transfer.getByRole("combobox", { name: "Other account" }).click();
    await page.getByRole("option", { name: "E2E Fixed deposit" }).click();
    await clickUntilDialogCloses(transfer, "Mark as transfer");

    // A programme edit reverses and reposts the recognition only.
    await page.goto(`/income?contribution=${fixture.upiGiftId}`);
    await waitForZeroReady(page);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Edit" })
      .click();
    const edit = page.getByRole("dialog", { name: "Edit contribution" });
    await pickOption(edit, page, "Programme", "Arts and culture");
    await clickUntilDialogCloses(edit, "Save changes");

    await page.goto("/finance/books");
    await waitForZeroReady(page);
    await postPending(page);
    await expect
      .poll(() => books<string[]>("postings", fixture.upiGiftId), {
        timeout: 30_000,
      })
      .toEqual(["recognise", "cash", "reverse:recognise", "recognise"]);
    await expect
      .poll(() => books<string[]>("postings", fixture.transferLineId), {
        timeout: 30_000,
      })
      .toEqual(["cash"]);
    await expect(
      railAccount(page, fixture.bankName).getByTestId("books-account-balance")
    ).toHaveText("₹1,176.40", { timeout: 15_000 });
    // The bank's money didn't move with the programme edit: one receipt.
    await railAccount(page, fixture.bankName).click();
    await expect(
      cashBook.getByRole("row").filter({ hasText: "Receipt" })
    ).toHaveCount(1);
    // The gifts' surplus sits in the General Fund, shown beside its opening.
    await page.getByRole("tab", { name: "Balance summary" }).click();
    await expect(
      page
        .getByTestId("balance-funds")
        .getByRole("listitem")
        .filter({ hasText: "General Fund (Domestic)" })
        .getByTestId("balance-fund-movement")
    ).toHaveText(
      /^Opening balance -?₹[\d,.]+ · Current year (surplus|deficit) ₹[\d,.]+$/
    );
    await page.getByRole("tab", { name: "Income & expenditure" }).click();
    await page
      .getByTestId("income-expenditure")
      .getByRole("row")
      .filter({ hasText: "Donations received" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Reversal");
  });

  test("credits a corpus gift to the Corpus Fund, never as income", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Treasurer test");
    test.setTimeout(120_000);
    await books("ensure-opening", YEAR);
    const run = `${Date.now()}${testInfo.retry}`;
    const fixture = await books("corpus-gift", run);

    await page.goto("/finance/books");
    await waitForZeroReady(page);
    await postPending(page);
    await expect
      .poll(() => books<string[]>("entries", fixture.id), { timeout: 30_000 })
      .toEqual(["CORPUS_DONATIONS CORPUS 70000"]);
    await expect(
      railAccount(page, fixture.bankName).getByTestId("books-account-balance")
    ).toHaveText("₹700.00", { timeout: 15_000 });

    // Not in income and expenditure (searched, so a later page can't hide it).
    await page.getByRole("tab", { name: "Income & expenditure" }).click();
    const incomeExpenditure = page.getByTestId("income-expenditure");
    await incomeExpenditure
      .getByPlaceholder("Search...")
      .fill("Corpus donations");
    await expect(incomeExpenditure).toContainText("Nothing matches.");

    // The Corpus Fund shows it among the year's additions.
    await page.getByRole("tab", { name: "Balance summary" }).click();
    await expect(
      page
        .getByTestId("balance-funds")
        .getByRole("listitem")
        .filter({ hasText: "Corpus Fund" })
        .getByTestId("balance-fund-movement")
    ).toHaveText(
      /^Opening balance -?₹[\d,.]+ · Additions during the year ₹[\d,.]+$/
    );
    await expect(page.getByTestId("balance-check")).toHaveText("Balances");
  });

  test("lists a gift waiting for a closed year, and posts it once the year reopens", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Treasurer test");
    test.setTimeout(120_000);
    // Self-sufficient: CI shards may run this without the test above.
    await books("ensure-opening", YEAR);
    const run = `${Date.now()}${testInfo.retry}`;
    const fixture = await books("income-fixture", run);
    await page.goto("/finance/books");
    await waitForZeroReady(page);
    await postPending(page);
    try {
      await books("close-year", YEAR);
      const gift = await books("gift", fixture.bankId, "2026-08-01");
      await page.reload();
      await waitForZeroReady(page);
      await postPending(page);
      const banner = page.getByTestId("waiting-to-post");
      await expect(banner).toContainText("Waiting to post", {
        timeout: 15_000,
      });
      await banner.getByRole("button", { name: "Show" }).click();
      const waiting = page.getByTestId("waiting-list");
      await expect(waiting).toContainText("Year closed");
      await expect(waiting).toContainText("1 Aug 2026");
      await page.keyboard.press("Escape");

      await books("reopen-year", YEAR);
      await page.reload();
      await waitForZeroReady(page);
      await postPending(page);
      await expect
        .poll(() => books<string[]>("postings", gift.id), { timeout: 30_000 })
        .toEqual(["recognise", "cash"]);
    } finally {
      await books("reopen-year", YEAR);
    }
  });

  test("won't close a year while one of its records waits to post", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Treasurer test");
    test.setTimeout(120_000);
    // Self-sufficient: CI shards may run this without the test above.
    await books("ensure-opening", YEAR);
    const run = `${Date.now()}${testInfo.retry}`;
    const payout = await books("waiting-payout", run);
    try {
      await page.goto("/finance/books");
      await waitForZeroReady(page);
      await postPending(page);
      const banner = page.getByTestId("waiting-to-post");
      await banner.getByRole("button", { name: "Show" }).click();
      await expect(page.getByTestId("waiting-list")).toContainText(
        "The settlement has no clearing account",
        { timeout: 15_000 }
      );
      await page.keyboard.press("Escape");
      // The real close, run as of the day after the year ended, refuses.
      const close = await books("close-year-strict", YEAR);
      // Refused for the waiting record (the opening balances stand).
      expect(close.refused).toBe(
        "Records dated in this year are waiting to post. Post them, or resolve why they wait, before closing the year"
      );
    } finally {
      await books("fix-payout", payout.id);
      await books("reopen-year", YEAR);
    }
  });

  // Expense posting (layer 3-3a). In the same serial group: it posts into
  // 2026-27, which the tests above close and reopen.
  test("posts an approved reimbursement and a vendor payment, lists one without proof, and follows an edit", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Treasurer test");
    test.setTimeout(150_000);
    // Self-sufficient: CI shards may run this without the tests above.
    await books("ensure-opening", YEAR);
    const run = `${Date.now()}${testInfo.retry}`;
    const fixture = await books("expense-fixture", run);

    await page.goto("/finance/books");
    await waitForZeroReady(page);
    await postPending(page);
    await expect
      .poll(() => books<string[]>("postings", fixture.claimId), {
        timeout: 30_000,
      })
      // The expense, the money out, and the claim as payable (settle).
      .toEqual(["recognise", "cash", "settle"]);
    // The vendor's payment left the bank as a supplier advance; its invoice
    // isn't approved yet, so no expense stands for it.
    await expect
      .poll(() => books<string[]>("postings", fixture.paymentId), {
        timeout: 30_000,
      })
      .toEqual(["recognise", "cash"]);
    expect(await books<string[]>("postings", fixture.vendorPaymentId)).toEqual(
      []
    );

    // Paid out of the main bank account (this run's), on the approval and
    // payment days.
    await railAccount(page, fixture.bankName).click();
    const cashBook = page.getByTestId("cash-book");
    const claimRows = cashBook
      .getByRole("row")
      .filter({ hasText: "20 Jun 2026" })
      .filter({ hasText: "Payout" });
    await expect(claimRows).toContainText("₹425.00", { timeout: 15_000 });
    await expect(
      cashBook
        .getByRole("row")
        .filter({ hasText: "10 Jul 2026" })
        .filter({ hasText: "Payout" })
    ).toContainText("₹2,500.00");
    // The books still balance between the payment and its invoice.
    await page.getByRole("tab", { name: "Balance summary" }).click();
    await expect(page.getByTestId("balance-check")).toHaveText("Balances", {
      timeout: 15_000,
    });

    // An approved reimbursement without its payment screenshot waits.
    const banner = page.getByTestId("waiting-to-post");
    await banner.getByRole("button", { name: "Show" }).click();
    await expect(page.getByTestId("waiting-list")).toContainText(
      "No payment screenshot",
      { timeout: 15_000 }
    );
    await page.keyboard.press("Escape");

    // The expense is under its category's own head. Searched, since the
    // table pages and other specs' heads can push this one off page one.
    await page.getByRole("tab", { name: "Income & expenditure" }).click();
    const incomeExpenditure = page.getByTestId("income-expenditure");
    await incomeExpenditure
      .getByPlaceholder("Search...")
      .fill(fixture.categoryName);
    const headRow = incomeExpenditure
      .getByRole("row")
      .filter({ hasText: fixture.categoryName });
    await expect(headRow).toContainText("₹425.00", { timeout: 15_000 });

    // Approving the invoice in the app recognises the vendor's expense.
    await page.goto(`/vendor-payments/${fixture.vendorPaymentId}`);
    await waitForZeroReady(page);
    await page.getByRole("button", { name: "Approve invoice" }).click();
    const approve = page.getByRole("alertdialog");
    await approve.getByRole("button", { name: "Approve" }).click();
    await expect(approve).toBeHidden({ timeout: 10_000 });
    await expect(
      page
        .locator('[data-slot="status-badge"]')
        .getByText("Completed", { exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // An edit after posting reverses and reposts the reimbursement.
    await books("edit-claim", fixture.claimId);
    await page.goto(
      `/finance/books?tab=income&ieSearch=${encodeURIComponent(fixture.categoryName)}`
    );
    await waitForZeroReady(page);
    await postPending(page);
    await expect
      .poll(() => books<string[]>("postings", fixture.vendorPaymentId), {
        timeout: 30_000,
      })
      .toEqual(["recognise"]);
    // Every part reversed and reposted (the reversals in any order).
    await expect
      .poll(
        async () =>
          [...(await books<string[]>("postings", fixture.claimId))].sort(),
        { timeout: 30_000 }
      )
      .toEqual([
        "cash",
        "cash",
        "recognise",
        "recognise",
        "reverse:cash",
        "reverse:recognise",
        "reverse:settle",
        "settle",
        "settle",
      ]);
    await expect(headRow).toContainText("₹2,975.00", { timeout: 15_000 });
    await railAccount(page, fixture.bankName).click();
    await page.getByRole("tab", { name: "Cash book" }).click();
    // The original payment, its reversal and the corrected one.
    await expect(claimRows).toHaveCount(3, { timeout: 15_000 });
  });

  // The audit fee provision: in this serial group because it posts into
  // 2026-27 and reads the books, which other tests close and match.
  test("charges an auditor's invoice to the audit fee provision: the payment clears it and only the rest is expense", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Treasurer test");
    test.setTimeout(150_000);
    await books("ensure-opening", YEAR);
    const run = `audit${Date.now()}${testInfo.retry}`;
    // The opening balances carry the provision; earlier runs' auditor
    // invoices are voided so it is whole.
    const fixture = await books<{
      amountPaise: number;
      outstandingPaise: number;
      vendorPaymentId: string;
      years: string[];
    }>("provision-fixture", run, YEAR);
    // The opening balances of YEAR hold the provision for the year before
    // it; the invoice is approved today, in whatever year today is.
    const providedFor = yearBefore(YEAR);
    expect(financialYearOf(todayInIndia()) >= YEAR).toBe(true);
    try {
      expect(fixture.outstandingPaise).toBeGreaterThan(0);
      expect(fixture.years).toEqual([providedFor]);
      const cleared = Math.min(fixture.outstandingPaise, fixture.amountPaise);
      const rest = fixture.amountPaise - cleared;

      // Finance charges the line to the provision at invoice approval; the
      // picker says what is outstanding and from which year.
      await page.goto(`/vendor-payments/${fixture.vendorPaymentId}`);
      await waitForZeroReady(page);
      await page.getByRole("button", { name: "Approve invoice" }).click();
      const approve = page.getByRole("alertdialog");
      // Folded away until asked for: every line goes to its category.
      await expect(approve.getByRole("combobox")).toHaveCount(0);
      await approve
        .getByRole("button", { name: "Charge to a provision" })
        .click();
      await pickOption(approve, page, "Charge to", "Audit fees payable");
      await expect(approve.getByTestId("provision-outstanding")).toContainText(
        `${inr(fixture.outstandingPaise)} outstanding from FY ${providedFor}`,
        { timeout: 15_000 }
      );
      await approve.getByRole("button", { name: "Approve" }).click();
      await expect(approve).toBeHidden({ timeout: 10_000 });
      await expect(
        page
          .locator('[data-slot="status-badge"]')
          .getByText("Completed", { exact: true })
      ).toBeVisible({ timeout: 10_000 });

      // The books: the provision decreases by what was outstanding, the
      // rest is audit fees, and the payment's supplier advance is cleared.
      await postPendingFromBooks(page);
      const expected = [
        `AUDIT_FEES_PAYABLE GEN -${cleared}`,
        `SUPPLIER_ADVANCES GEN -${fixture.amountPaise}`,
        ...(rest > 0 ? [`AUDIT_FEES GEN ${rest}`] : []),
      ].sort();
      await expect
        .poll(() => books<string[]>("entries", fixture.vendorPaymentId), {
          timeout: 30_000,
        })
        .toEqual(expected);
      await page.getByRole("tab", { name: "Balance summary" }).click();
      await expect(page.getByTestId("balance-check")).toHaveText("Balances", {
        timeout: 15_000,
      });

      // The invoice shows how the books split it.
      await page.goto(`/vendor-payments/${fixture.vendorPaymentId}`);
      await waitForZeroReady(page);
      const split = page.getByTestId("provision-split");
      await expect(split).toContainText(
        `${inr(cleared)} cleared from Audit fees payable`,
        { timeout: 30_000 }
      );
      if (rest > 0) {
        await expect(split).toContainText(`${inr(rest)} as audit fees`);
      }
    } finally {
      // The provision stands whole again for the tests after this one.
      await books("void-auditor-invoices");
    }
  });

  test("downloads the year's CA workbook as a valid XLSX with its five sheets", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Treasurer test");
    // The workbook needs the opening balances; post them here so this test
    // doesn't depend on another one running first (CI shards split the group).
    await books("ensure-opening", YEAR);
    await page.goto(`/finance/books?year=${YEAR}`);
    await waitForZeroReady(page);
    const item = await openPageAction(page, "Download CA workbook (XLSX)");
    // Enabled once the opening balances stand. A disabled item shows its
    // reason underneath, so a failure reports that reason.
    await expect
      .poll(
        async () =>
          (await item.isEnabled())
            ? "enabled"
            : `disabled: ${(await item.innerText()).replaceAll("\n", " ")}`,
        { timeout: 15_000 }
      )
      .toBe("enabled");
    const downloadPromise = page.waitForEvent("download");
    await item.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      `proud-indian-ca-workbook-${YEAR}.xlsx`
    );
    const file = await download.path();
    const sheets = await readXlsxFile(file);
    expect(sheets.map((s) => s.sheet)).toEqual([
      "Receipts and payments",
      "Income and expenditure",
      "Income and expenditure summary",
      "Balance sheet items",
      "Donor list (Form 113)",
    ]);
    const balance = sheets[3]?.data ?? [];
    expect(balance[0]?.[0]).toBe("Item");
    const check = balance.at(-1) ?? [];
    expect(String(check[0])).toContain("(balances)");
    expect(check[4]).toBe(0);
    // Income less expenditure sits in its fund (opening balance plus the
    // current year's surplus), never on a line of its own.
    expect(
      balance.some((row) =>
        String(row[0]).startsWith("Income less expenditure")
      )
    ).toBe(false);
    // IDs are always masked in the workbook; a finance admin sees the list.
    expect(sheets[4]?.data[0]?.[2]).toBe("ID (last 4)");
    await expect(page.getByText("CA workbook downloaded")).toBeVisible();
  });

  // Voiding (finance Option B) and payment proof after approval: they post
  // into 2026-27 and poll its postings, so they share this serial group
  // with the tests that close it and match its audited figures (which
  // freeze it). e2e/books-serial-group.test.ts keeps them here.
  test("finance voids it instead of deleting it, and the books reverse it", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    test.setTimeout(150_000);
    await books("ensure-opening", YEAR);
    const run = `void${Date.now()}${testInfo.retry}`;
    const fixture = await books("expense-fixture", run);
    const title = `E2E books claim ${run}`;

    await postPendingFromBooks(page);
    await expect
      .poll(() => books<string[]>("postings", fixture.claimId), {
        timeout: 30_000,
      })
      .toEqual(["recognise", "cash", "settle"]);

    // In the books: the list offers Void, not Delete.
    const list = new ListPage(page);
    const row = await findInList(page, title);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await list.openRowActionMenu(row);
    await expect(page.getByRole("menuitem", { name: "Void" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Void it from the detail page, with a reason.
    await page.goto(`/reimbursements/${fixture.claimId}`);
    await waitForZeroReady(page);
    await clickPageAction(page, "Void");
    const dialog = page.getByRole("alertdialog");
    const confirm = dialog.getByRole("button", { name: "Void" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Reason").fill("Paid twice by mistake");
    await confirm.click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Reimbursement voided")).toBeVisible();
    await expect(page.getByTestId("void-badge").first()).toBeVisible();
    await expect(page.getByText("Paid twice by mistake").first()).toBeVisible();
    // It takes no further change.
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

    // The books reverse all three parts, once.
    await postPendingFromBooks(page);
    await expect
      .poll(
        async () =>
          [...(await books<string[]>("postings", fixture.claimId))].sort(),
        { timeout: 30_000 }
      )
      .toEqual([
        "cash",
        "recognise",
        "reverse:cash",
        "reverse:recognise",
        "reverse:settle",
        "settle",
      ]);
    await page.getByRole("tab", { name: "Balance summary" }).click();
    await expect(page.getByTestId("balance-check")).toHaveText("Balances", {
      timeout: 15_000,
    });
    await postPendingFromBooks(page);
    expect(await books<string[]>("postings", fixture.claimId)).toHaveLength(6);

    // Hidden from the list until asked, then shown marked Void.
    const hidden = await findInList(page, title);
    await expect(hidden).toHaveCount(0, { timeout: 15_000 });
    await page.getByTestId("voided-filter").click();
    await expect(hidden).toBeVisible({ timeout: 15_000 });
    await expect(hidden.getByTestId("void-badge")).toBeVisible();
    await list.openRowActionMenu(hidden);
    await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Void" })).toHaveCount(0);
  });

  test("finance finds claims without proof, adds it, and the claim posts", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    test.setTimeout(180_000);
    await books("ensure-opening", YEAR);
    const run = `proof${Date.now()}${testInfo.retry}`;
    const fixture = await books("expense-fixture", run);
    const noProofTitle = `E2E books claim without proof ${run}`;

    // The claim without a screenshot waits, and the waiting list links to
    // adding its proof.
    await postPendingFromBooks(page);
    await openWaitingList(page);
    await expect(page.getByTestId("missing-proof-summary")).toBeVisible();
    const addLink = page
      .getByTestId("waiting-list")
      .locator(`a[href*="${fixture.noProofId}"][href*="proof=add"]`);
    await expect(addLink).toHaveText("Add payment proof", { timeout: 15_000 });

    // "Show them on Reimbursements" opens the list filtered to them.
    await page
      .getByTestId("missing-proof-summary")
      .getByRole("link", { name: "Show them on Reimbursements" })
      .click();
    await expect(page).toHaveURL(/\/reimbursements\?filters=/);
    await waitForZeroReady(page);
    const search = page.getByPlaceholder("Search reimbursements...");
    await search.fill(noProofTitle);
    await expect(
      page.getByRole("row").filter({ hasText: noProofTitle })
    ).toBeVisible({ timeout: 15_000 });
    await search.fill(fixture.claimTitle);
    await expect(
      page.getByRole("row").filter({ hasText: fixture.claimTitle })
    ).toHaveCount(0);
    // Approved before 1 Apr 2026: the books never post it, so it isn't listed.
    await search.fill(fixture.earlyNoProofTitle);
    await expect(
      page.getByRole("row").filter({ hasText: fixture.earlyNoProofTitle })
    ).toHaveCount(0);
    // The attention view beside the status tabs applies the same filter.
    await page.goto("/reimbursements");
    await waitForZeroReady(page);
    const missingView = page.getByRole("tab", {
      name: /^Missing payment proof \d+$/,
    });
    await missingView.click();
    await expect(page).toHaveURL(/filters=/);
    await expect(missingView).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: /^All \d+$/ })).toHaveAttribute(
      "aria-selected",
      "false"
    );
    await page.getByPlaceholder("Search reimbursements...").fill(noProofTitle);
    await expect(
      page.getByRole("row").filter({ hasText: noProofTitle })
    ).toBeVisible({ timeout: 15_000 });
    // A status tab replaces it: the attention view is no longer selected.
    await page.getByRole("tab", { name: /^Approved \d+$/ }).click();
    await expect(
      page.getByRole("tab", { name: /^Approved \d+$/ })
    ).toHaveAttribute("aria-selected", "true");
    await expect(missingView).toHaveAttribute("aria-selected", "false");
    // The Voided toggle stays in the toolbar, not among the views.
    await expect(page.getByRole("tab", { name: /voided/i })).toHaveCount(0);

    // The waiting list's link opens the claim with Add payment proof.
    await page.goto("/finance/books");
    await waitForZeroReady(page);
    await openWaitingList(page);
    await page
      .getByTestId("waiting-list")
      .locator(`a[href*="${fixture.noProofId}"][href*="proof=add"]`)
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/reimbursements/${fixture.noProofId}`)
    );
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Add payment proof");
    await expect(page.getByTestId("payment-proof-missing")).toBeVisible();

    if (process.env.CI) {
      // Saving promotes the upload in R2, which CI does not have: check the
      // dialog takes the screenshot, then stop.
      await new ApprovalDetailPage(page).stubScreenshotUpload();
      await dialog
        .getByLabel("Payment screenshot")
        .setInputFiles(PAYMENT_SCREENSHOT_FIXTURE);
      await expect(
        dialog.getByRole("img", { name: "Payment screenshot preview" })
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        dialog.getByRole("button", { name: "Add proof" })
      ).toBeEnabled();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      return;
    }

    await dialog
      .getByLabel("Payment screenshot")
      .setInputFiles(PAYMENT_SCREENSHOT_FIXTURE);
    await expect(
      dialog.getByRole("img", { name: "Payment screenshot preview" })
    ).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Add proof" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId("payment-proof-missing")).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByAltText("Payment proof")).toBeVisible();
    await expect(page.getByText("Payment proof added").first()).toBeVisible();

    // The books post it now.
    await expect
      .poll(
        async () => {
          await postPendingFromBooks(page);
          return await books<string[]>("postings", fixture.noProofId);
        },
        { timeout: 60_000 }
      )
      // The expense, the money out and the claim as payable (settle).
      .toEqual(["recognise", "cash", "settle"]);

    // Replacing keeps the old screenshot among the attachments.
    await page.goto(`/reimbursements/${fixture.noProofId}`);
    await waitForZeroReady(page);
    await (await openPageAction(page, "Replace payment proof")).click();
    const replace = page.getByRole("alertdialog");
    await expect(replace).toContainText("Replace payment proof?");
    await replace
      .getByLabel("Payment screenshot")
      .setInputFiles(PAYMENT_SCREENSHOT_FIXTURE);
    await expect(
      replace.getByRole("img", { name: "Payment screenshot preview" })
    ).toBeVisible({ timeout: 15_000 });
    await replace.getByRole("button", { name: "Replace proof" }).click();
    await expect(replace).toBeHidden({ timeout: 15_000 });
    await expect(
      page.getByText(/^payment-proof-replaced-\d{4}-\d{2}-\d{2}\.png$/).first()
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Payment proof replaced").first()
    ).toBeVisible();
  });

  // Audited figures (the year-end true-up). In this serial group: other
  // tests close and reopen 2026-27, and these figures post into it.
  test("compares the signed balance sheet line by line, refuses a money account that differs, and opens the next year at the matched figures", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Treasurer test");
    test.setTimeout(120_000);
    await books("audited-fixture", YEAR);
    try {
      await page.goto(`/finance/books/audited?year=${YEAR}`);
      await waitForZeroReady(page);
      await expect(page.getByTestId("audited-status")).toHaveText(
        "Not matched"
      );
      // FY 2026-27 is still running: figures can be compared, not posted.
      await expect(page.getByTestId("audited-post-blocker")).toContainText(
        "ends on"
      );

      // The signed figures: the books', less 20 of depreciation on the
      // sewing machine, with the audit fee payable written back.
      const lines = page.getByTestId("audited-line");
      await expect(lines.first()).toBeVisible({ timeout: 15_000 });
      const asset = lines.filter({ hasText: "E2E sewing machine" });
      const liability = lines.filter({ hasText: "Audit fees payable" });
      const bank = lines.filter({ hasText: "E2E Bank Account" });
      const liabilityPaise = Number(
        await liability.getAttribute("data-books-paise")
      );
      for (const row of await lines.all()) {
        const paise = Number(await row.getAttribute("data-books-paise"));
        const isAsset = (await row.innerText()).includes("E2E sewing machine");
        const isLiability = (await row.innerText()).includes(
          "Audit fees payable"
        );
        let audited = paise;
        if (isAsset) {
          audited = paise - 2000;
        } else if (isLiability) {
          audited = 0;
        }
        await row.getByRole("textbox").fill(rupeesText(audited));
      }
      const general = page
        .getByTestId("audited-fund")
        .filter({ hasText: "General Fund (Domestic)" });
      for (const row of await page.getByTestId("audited-fund").all()) {
        const paise = Number(await row.getAttribute("data-books-paise"));
        await row.getByRole("textbox").fill(rupeesText(paise));
      }
      // Before the General Fund moves with the adjustments, it differs.
      await expect(general).toContainText("Still differs");
      const generalPaise = Number(
        await general.getAttribute("data-books-paise")
      );
      await general
        .getByRole("textbox")
        .fill(rupeesText(generalPaise - 2000 + liabilityPaise));

      await expect(asset).toContainText("Depreciation");
      await expect(asset).toContainText("-₹20.00");
      await expect(liability).toContainText("Year-end adjustment");
      await expect(general).toContainText("Agrees");
      await expect(page.getByTestId("audited-surplus")).toHaveText(
        `+${inr(liabilityPaise - 2000)}`.replace("+-", "-")
      );
      await expect(page.getByTestId("audited-ready")).toBeVisible();

      // A bank charge missing from the books: money accounts are never adjusted.
      const bankPaise = Number(await bank.getAttribute("data-books-paise"));
      await bank.getByRole("textbox").fill(rupeesText(bankPaise - 500));
      await expect(bank).toContainText("Find the missing records");
      await expect(
        bank.getByRole("link", { name: "Open the cash book" })
      ).toBeVisible();
      await expect(page.getByTestId("audited-blockers")).toContainText(
        "Money accounts are never adjusted"
      );
      await expect(
        page.getByRole("button", { name: "Post audited figures" })
      ).toBeDisabled();

      // Posted as of the day after the year end, through the real posting.
      const posted = await books<{ assetAuditedPaise: number }>(
        "post-audited",
        YEAR
      );
      await page.reload();
      await waitForZeroReady(page);
      await expect(page.getByTestId("audited-status")).toHaveText("Matched", {
        timeout: 15_000,
      });
      const assetLine = page
        .getByTestId("audited-view-line")
        .filter({ hasText: "E2E sewing machine" });
      await expect(assetLine).toContainText("Posted against Depreciation");
      await expect(assetLine).not.toContainText("Changed since");
      await expect(assetLine).toContainText(inr(posted.assetAuditedPaise));

      // The year-close checklist sees it.
      await page.goto(`/finance/books?year=${YEAR}`);
      await waitForZeroReady(page);
      await clickPageAction(page, `Close ${YEAR}`);
      const closeDialog = page.getByRole("dialog");
      await expect(
        closeDialog.getByTestId("close-check-audited_figures")
      ).toHaveAttribute("data-ok", "true");
      await closeDialog.getByRole("button", { name: "Cancel" }).click();

      // The next year opens at the audited figures: the provision is gone.
      await page.goto("/finance/books?year=2027-28&tab=balance");
      await waitForZeroReady(page);
      await expect(page.getByTestId("balance-check")).toHaveText("Balances");
      await expect(
        page
          .getByTestId("balance-liabilities")
          .getByRole("listitem")
          .filter({ hasText: "Audit fees payable" })
      ).toContainText("₹0.00");

      // A correction starts by reversing them.
      await page.goto(`/finance/books/audited?year=${YEAR}`);
      await waitForZeroReady(page);
      await clickPageAction(page, "Reverse audited figures");
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Reason").fill("E2E: the CA revised them");
      await dialog
        .getByRole("button", { name: "Reverse audited figures" })
        .click();
      await expect(page.getByTestId("audited-status")).toHaveText(
        "Not matched",
        { timeout: 15_000 }
      );
    } finally {
      await books("reverse-audited", YEAR);
    }
  });
});

test.describe("Books (readers)", () => {
  test("a volunteer sees no payment proof action or count", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer test");
    await page.goto("/reimbursements");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("tab", { name: /^Missing payment proof / })
    ).toHaveCount(0);
  });

  test("finance.view reads the books but can't post, close or reopen", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/finance/books");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { exact: true, name: "Books" })
    ).toBeVisible();
    await expect(await openPageAction(page, `Close ${YEAR}`)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/finance/books/opening");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("button", { name: "Post opening balances" })
    ).toHaveCount(0);
  });

  test("a volunteer can't open the books", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/finance/books");
    await expect(page).not.toHaveURL(/\/finance\/books/);
    await expect(page.getByRole("link", { name: "Books" })).toHaveCount(0);
  });
});
