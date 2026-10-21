import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { ApprovalDetailPage } from "../../pages/approval-detail-page";

const execFileAsync = promisify(execFile);

const VOLUNTEER_AUTH = path.resolve(
  import.meta.dirname,
  "../../.auth/volunteer.json"
);

interface Claim {
  id: string;
  title: string;
}

/** Two programmes (led by the volunteer and the admin) and a claim on each. */
async function setupClaims(): Promise<{ led: Claim; other: Claim }> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/lead-approval.ts"),
      "setup",
      String(Date.now()),
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as { led: Claim; other: Claim };
}

test.describe("Programme lead approval", () => {
  test("the lead approves a claim on their programme, then finance; never another programme's", async ({
    baseURL,
    browser,
    page,
  }) => {
    test.slow();
    const { led, other } = await setupClaims();

    const leadContext = await browser.newContext({
      baseURL,
      storageState: VOLUNTEER_AUTH,
    });
    try {
      const leadPage = await leadContext.newPage();
      await leadPage.goto("/reimbursements");
      await waitForZeroReady(leadPage);
      const leadMain = leadPage.locator("#main");
      // Their programme's claim is listed and waits for them; the other
      // programme's is not.
      await expect(leadMain.getByText(led.title)).toBeVisible({
        timeout: 30_000,
      });
      await expect(leadMain.getByText(other.title)).toHaveCount(0);
      await leadPage.getByRole("tab", { name: /Waiting for you/ }).click();
      await expect(leadMain.getByText(led.title)).toBeVisible();

      await leadPage.goto(`/reimbursements/${led.id}`);
      await waitForZeroReady(leadPage);
      await expect(
        leadPage.getByRole("heading", { name: led.title })
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        leadMain.getByText("Waiting for Test Volunteer")
      ).toBeVisible();
      // The lead judges the claim, not where the claimant is paid.
      await expect(
        leadMain.getByRole("region", { name: "Paid to" })
      ).toHaveCount(0);
      await leadPage
        .getByRole("button", { exact: true, name: "Approve" })
        .click();
      await expect(
        leadPage.getByText("Approved. Finance reviews it next")
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        leadMain.getByText(/^Approved by Test Volunteer on /)
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        leadPage.getByRole("button", { exact: true, name: "Approve" })
      ).toHaveCount(0);

      // Another programme's claim doesn't open for them.
      await leadPage.goto(`/reimbursements/${other.id}`);
      await waitForZeroReady(leadPage);
      await expect(leadPage.getByText("Reimbursement not found")).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        leadPage.getByRole("button", { exact: true, name: "Approve" })
      ).toHaveCount(0);
    } finally {
      await leadContext.close();
    }

    const detail = new ApprovalDetailPage(page);

    // Finance on the other claim: its lead hasn't approved, so approving
    // asks why.
    await page.goto(`/reimbursements/${other.id}`);
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: other.title })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Waiting for Test Admin")).toBeVisible();
    await detail.getApproveButton().click();
    const skipDialog = detail.getAlertDialog();
    await expect(
      skipDialog.getByLabel(/Reason to approve without Test Admin/)
    ).toBeVisible();
    await skipDialog.getByRole("button", { name: "Cancel" }).click();

    // Finance on the claim its lead approved: no reason asked.
    await page.goto(`/reimbursements/${led.id}`);
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: led.title })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.locator("#main").getByText(/^Approved by Test Volunteer on /)
    ).toBeVisible();
    await detail.getApproveButton().click();
    const dialog = detail.getAlertDialog();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/Reason to approve without/)).toHaveCount(0);
    // Approving promotes the payment screenshot in R2, which CI does not have.
    if (process.env.CI) {
      await dialog.getByRole("button", { name: "Cancel" }).click();
      return;
    }
    await detail.attachPaymentScreenshot(dialog);
    await dialog.getByRole("button", { name: "Approve" }).click();
    await expect(detail.getStatusBadge("Approved")).toBeVisible({
      timeout: 15_000,
    });
  });
});
