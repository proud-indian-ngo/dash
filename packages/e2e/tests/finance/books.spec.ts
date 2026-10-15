import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Locator, Page } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { clickUntilDialogCloses } from "../../helpers/dialog-submit";
import { clickPageAction, openPageAction } from "../../helpers/page-header";

/*
 * The books (finance Phase 3, layer 1): opening balances, the books views
 * and year close. Amounts are fake; the real figures are only ever typed in
 * by the treasurer.
 */

const YEAR = "2026-27";
const execFileAsync = promisify(execFile);

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
    await page.getByRole("tab", { name: "Income & expenditure" }).click();
    await page
      .getByTestId("income-expenditure")
      .getByRole("row")
      .filter({ hasText: "Donations received" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Reversal");
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
    // IDs are always masked in the workbook; a finance admin sees the list.
    expect(sheets[4]?.data[0]?.[2]).toBe("ID (last 4)");
    await expect(page.getByText("CA workbook downloaded")).toBeVisible();
  });
});

test.describe("Books (readers)", () => {
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
