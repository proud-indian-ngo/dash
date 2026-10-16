import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickPageAction } from "../../helpers/page-header";
import { ListPage } from "../../pages/list-page";

/*
 * Voiding (finance Option B): a reimbursement the books hold can't be
 * deleted; finance voids it with a reason, it stays as a record marked Void,
 * and the books reverse it on the void day.
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

async function postPending(page: Page) {
  await page.goto("/finance/books");
  await waitForZeroReady(page);
  await clickPageAction(page, "Post pending");
  await expect(
    page.getByText(/^(Posted: |The books are up to date)/).first()
  ).toBeVisible({ timeout: 30_000 });
}

/** The reimbursements list, searched down to one title. */
async function findInList(page: Page, title: string) {
  await page.goto("/reimbursements");
  await waitForZeroReady(page);
  await page.getByPlaceholder("Search reimbursements...").fill(title);
  return new ListPage(page).getRowByText(title);
}

test.describe("Voiding a posted reimbursement", () => {
  test("finance voids it instead of deleting it, and the books reverse it", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    test.setTimeout(150_000);
    await books("ensure-opening", YEAR);
    const run = `void${Date.now()}${testInfo.retry}`;
    const fixture = await books("expense-fixture", run);
    const title = `E2E books claim ${run}`;

    await postPending(page);
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
    await postPending(page);
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
    await postPending(page);
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
});
