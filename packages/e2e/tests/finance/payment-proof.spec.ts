import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickPageAction, openPageAction } from "../../helpers/page-header";
import {
  ApprovalDetailPage,
  PAYMENT_SCREENSHOT_FIXTURE,
} from "../../pages/approval-detail-page";

/*
 * Payment proof after approval: an approved reimbursement without its
 * payment screenshot waits in the books ("No payment screenshot"). Finance
 * finds it from the Books waiting list or the Reimbursements filter, adds
 * the screenshot, and the claim posts.
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

async function openWaitingList(page: Page) {
  await page
    .getByTestId("waiting-to-post")
    .getByRole("button", { name: "Show" })
    .click();
  await expect(page.getByTestId("waiting-list")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Payment proof after approval", () => {
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
    await postPending(page);
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
    // The count button applies the same filter.
    await page.goto("/reimbursements");
    await waitForZeroReady(page);
    await page
      .getByRole("button", { name: /^Missing payment proof · / })
      .click();
    await expect(page).toHaveURL(/filters=/);
    await page.getByPlaceholder("Search reimbursements...").fill(noProofTitle);
    await expect(
      page.getByRole("row").filter({ hasText: noProofTitle })
    ).toBeVisible({ timeout: 15_000 });

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
          await postPending(page);
          return await books<string[]>("postings", fixture.noProofId);
        },
        { timeout: 60_000 }
      )
      .toEqual(["recognise", "cash"]);

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
      page.getByText("payment-proof-replaced.png").first()
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Payment proof replaced").first()
    ).toBeVisible();
  });

  test("a volunteer sees no payment proof action or count", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer test");
    await page.goto("/reimbursements");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("button", { name: /^Missing payment proof · / })
    ).toHaveCount(0);
  });
});
