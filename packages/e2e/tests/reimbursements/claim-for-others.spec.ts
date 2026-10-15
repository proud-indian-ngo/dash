import path from "node:path";

import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { chargeRequestTo } from "../../helpers/request-event";
import { ReimbursementPage } from "../../pages/reimbursement-page";

const VOLUNTEER_AUTH = path.resolve(
  import.meta.dirname,
  "../../.auth/volunteer.json"
);

async function pickPerson(page: Page, label: string, name: string) {
  const input = page.getByLabel(label);
  await input.click();
  await input.fill(name);
  await page
    .getByRole("option", { name: new RegExp(name) })
    .first()
    .click();
}

test.describe("Claim for others", () => {
  test("finance files a reimbursement for a volunteer, who then sees it", async ({
    baseURL,
    browser,
    page,
  }) => {
    test.slow();
    const reimbursements = new ReimbursementPage(page, "reimbursement");
    const title = `E2E Claim For Others ${Date.now()}`;

    await reimbursements.navigateToNew();
    await pickPerson(page, "Claim for", "Test Volunteer");
    await expect(page.getByText("Test Volunteer's saved accounts")).toBeVisible(
      { timeout: 25_000 }
    );
    // The claimant's default saved account fills in.
    await expect(
      page.getByRole("combobox").filter({ hasText: "••••" })
    ).toBeVisible({ timeout: 25_000 });
    await reimbursements.form.fillTitle(title);
    await reimbursements.form.selectCity("Bangalore");
    await chargeRequestTo(page, "Organisation (admin)");
    await reimbursements.selectExpenseDate();
    await reimbursements.form.fillLineItem({
      amount: "300",
      description: "Paid on their behalf",
    });
    await reimbursements.form.submit();
    await reimbursements.waitForDetail(title);

    const main = page.locator("#main");
    await expect(
      main.getByText("Raised by Test Finance Admin", { exact: true })
    ).toBeVisible();
    await expect(
      main.getByText("Raised by Test Finance Admin for Test Volunteer")
    ).toBeVisible();

    const volunteerContext = await browser.newContext({
      baseURL,
      storageState: VOLUNTEER_AUTH,
    });
    try {
      const volunteerPage = await volunteerContext.newPage();
      await volunteerPage.goto(
        `/reimbursements/${reimbursements.currentRequestId()}`
      );
      await waitForZeroReady(volunteerPage);
      await expect(
        volunteerPage.getByRole("heading", { name: title })
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        volunteerPage
          .locator("#main")
          .getByText("Raised by Test Finance Admin", { exact: true })
      ).toBeVisible();
      // Only finance moves a request to someone else.
      const menu = volunteerPage.getByRole("button", { name: "More actions" });
      if ((await menu.count()) > 0) {
        await menu.click();
      }
      await expect(
        volunteerPage.getByRole("menuitem", { name: "Change claimant" })
      ).toHaveCount(0);
    } finally {
      await volunteerContext.close();
    }
  });

  test("finance changes the claimant with a reason", async ({ page }) => {
    test.slow();
    const reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.createReimbursement("Change Claimant");

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Change claimant" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await pickPerson(page, "New claimant", "Test Volunteer");
    await expect(
      dialog.getByText("Test Volunteer's saved accounts")
    ).toBeVisible({ timeout: 25_000 });
    await dialog.getByLabel("Reason").fill("Paid by the volunteer");
    await dialog.getByRole("button", { name: "Change claimant" }).click();

    await expect(
      page.getByText("Claimant changed to Test Volunteer")
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page
        .locator("#main")
        .getByText(
          "Claimant changed from Test Finance Admin to Test Volunteer. Reason: Paid by the volunteer"
        )
    ).toBeVisible();
  });
});
