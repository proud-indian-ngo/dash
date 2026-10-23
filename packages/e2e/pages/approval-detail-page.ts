import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";

export const PAYMENT_SCREENSHOT_FIXTURE = path.resolve(
  import.meta.dirname,
  "../fixtures/images/payment-screenshot.png"
);

export class ApprovalDetailPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  getApproveButton(): Locator {
    return this.page.getByRole("button", { name: "Approve" });
  }

  getRejectButton(): Locator {
    return this.page.getByRole("button", { name: "Reject" });
  }

  getEditSubmissionButton(): Locator {
    return this.page.getByRole("button", { exact: true, name: "Edit" });
  }

  getViewDetailsButton(): Locator {
    return this.page.getByRole("button", { name: "View details" });
  }

  getAlertDialog(): Locator {
    return this.page.getByRole("alertdialog");
  }

  getStatusBadge(status: string): Locator {
    return this.page.locator('[data-slot="status-badge"]', { hasText: status });
  }

  /**
   * Approves with the payment screenshot attached, which is uploaded to R2
   * and promoted on approval.
   */
  async approve(message?: string): Promise<void> {
    await this.getApproveButton().click();
    const dialog = this.getAlertDialog();
    await expect(dialog).toBeVisible();
    if (message) {
      await dialog
        .getByPlaceholder("Optional message to the submitter...")
        .fill(message);
    }
    await this.attachPaymentScreenshot(dialog);
    await dialog.getByRole("button", { name: "Approve" }).click();
  }

  async attachPaymentScreenshot(dialog: Locator): Promise<void> {
    await dialog
      .getByLabel("Payment screenshot")
      .setInputFiles(PAYMENT_SCREENSHOT_FIXTURE);
    await expect(
      dialog.getByRole("img", { name: "Payment screenshot preview" })
    ).toBeVisible({ timeout: 15_000 });
  }

  async reject(reason: string): Promise<void> {
    await this.getRejectButton().click();
    const dialog = this.getAlertDialog();
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("Rejection reason...").fill(reason);
    await dialog.getByRole("button", { name: "Reject" }).click();
  }

  async editSubmission(): Promise<void> {
    const button = this.getEditSubmissionButton();
    await expect(button).toBeVisible();
    await button.scrollIntoViewIfNeeded();
    await button.click();
  }

  getGenerateVoucherButton(): Locator {
    return this.page.getByRole("button", { name: "Generate Voucher" });
  }

  getRegenerateVoucherButton(): Locator {
    return this.page.getByRole("button", { name: /Regenerate/ });
  }

  getVoucherGeneratedIndicator(): Locator {
    return this.page.getByText("Generated");
  }
}
