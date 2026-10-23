// @e2e-areas income
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import type { IncomeFixture } from "../../helpers/books";
import { BOOKS_YEAR, books, postPending } from "../../helpers/books-steps";
import { pickDate } from "../../helpers/date-time-picker";
import { clickPageAction } from "../../helpers/page-header";

/**
 * Closing FY 2026-27 freezes it for every spec on the database: its records
 * wait to post, and statement imports and line actions dated in it are
 * refused. So every test that closes it runs here, in the `exclusive_last`
 * project: after every other project, with one worker. Each reopens the
 * year when it is done.
 */

const YEAR = BOOKS_YEAR;
const execFileAsync = promisify(execFile);

/** A bank account of this run, with nothing recorded against it. */
async function bankAccount(
  run: string
): Promise<{ accountId: string; accountName: string }> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/bank-statements.ts"),
      "account",
      run,
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim());
}

test.describe("Books year close (runs last, alone)", () => {
  test("posts balanced opening balances, refuses unbalanced ones, keeps a running year open and reopens a closed one", async ({
    page,
  }) => {
    // Other specs and earlier runs post opening balances: start from none.
    await books("clear-opening", YEAR);
    await page.goto("/finance/books/opening");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("button", { name: "Post opening balances" })
    ).toBeVisible({ timeout: 15_000 });

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
    // Every other spec has run by now and posted into the year, so the
    // totals are theirs too; only the check is the document's.

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

    // Reversing them, with a reason, brings the form back.
    await clickPageAction(page, "Reverse opening balances");
    const reverseDialog = page.getByRole("dialog");
    await reverseDialog.getByLabel("Reason").fill("E2E: CA revised them");
    await reverseDialog
      .getByRole("button", { name: "Reverse opening balances" })
      .click();
    await expect(
      page.getByRole("button", { name: "Post opening balances" })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("lists a gift waiting for a closed year, and posts it once the year reopens", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await books("ensure-opening", YEAR);
    const run = `${Date.now()}${testInfo.retry}`;
    const fixture = await books<IncomeFixture>("income-fixture", run);
    await page.goto("/finance/books");
    await waitForZeroReady(page);
    await postPending(page);
    try {
      await books("close-year", YEAR);
      const gift = await books<{ id: string }>(
        "gift",
        fixture.bankId,
        "2026-08-01"
      );
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
    test.setTimeout(120_000);
    await books("ensure-opening", YEAR);
    const run = `${Date.now()}${testInfo.retry}`;
    const payout = await books<{ id: string }>("waiting-payout", run);
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

  test("refuses a statement with lines in a closed year, and imports it once the year reopens", async ({
    page,
  }, testInfo) => {
    test.slow();
    const run = `${Date.now()}${testInfo.retry}`;
    const account = await bankAccount(run);
    const csv = Buffer.from(
      [
        "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
        `18/09/26,UPI/CR/CLOSED YEAR ${run},UPIC${run},18/09/26,,250.00,"10,250.00"`,
      ].join("\n"),
      "utf8"
    );

    await page.goto(`/income/bank/import?account=${account.accountId}`);
    await waitForZeroReady(page);
    const picker = page.getByRole("combobox", { name: "Bank account" });
    await picker.click();
    await picker.fill(account.accountName);
    await page
      .getByRole("option")
      .filter({ hasText: account.accountName })
      .first()
      .click();
    await page.getByTestId("import-file-input").setInputFiles({
      buffer: csv,
      mimeType: "text/csv",
      name: `closed-year-${run}.csv`,
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator('[data-column="Value Dt"]')).toContainText(
      "Date (value date)"
    );
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByTestId("statement-review-summary")).toContainText(
      "1 new line, 0 already imported"
    );
    await page.getByRole("button", { name: "Import 1 line" }).click();
    const confirm = page.getByRole("alertdialog");

    try {
      await books("close-year", YEAR);
      await confirm.getByRole("button", { name: "Import lines" }).click();
      await expect(
        page.getByText(
          `This statement has lines in FY ${YEAR}, which is closed: reopen it first`
        )
      ).toBeVisible();
    } finally {
      await books("reopen-year", YEAR);
    }

    // The failed run left the statement as it was: importing again works.
    await confirm.getByRole("button", { name: "Import lines" }).click();
    await expect(page.getByTestId("statement-import-result")).toContainText(
      "1 line imported"
    );
  });
});
