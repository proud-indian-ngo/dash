import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { clickPageAction, openPageAction } from "../../helpers/page-header";

/*
 * The books (finance Phase 3, layer 1): opening balances, the books views
 * and year close. Amounts are fake; the real figures are only ever typed in
 * by the treasurer.
 */

const YEAR = "2026-27";
const execFileAsync = promisify(execFile);

/** Runs a step of `helpers/books.ts` against the test database. */
async function books(...args: string[]): Promise<Record<string, string>> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/books.ts"),
      ...args,
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as Record<string, string>;
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
    await expect(page.getByTestId("balance-assets-total")).toHaveText(
      "₹3,050.00"
    );
    await expect(page.getByTestId("balance-funds-total")).toHaveText(
      "₹2,950.00"
    );
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
    await expect(
      page
        .getByTestId("books-account")
        .filter({ hasText: "E2E Fixed deposit" })
        .getByTestId("books-account-balance")
    ).toHaveText("₹2,000.00");

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
