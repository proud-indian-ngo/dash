import { expect, type Locator, type Page } from "@playwright/test";

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
    return this.page.getByRole("button", { name: "Edit submission" });
  }

  getViewDetailsButton(): Locator {
    return this.page.getByRole("button", { name: "View details" });
  }

  getAlertDialog(): Locator {
    return this.page.getByRole("alertdialog");
  }

  getStatusBadge(status: string): Locator {
    return this.page.locator('[data-slot="badge"]', { hasText: status });
  }

  async approve(message?: string): Promise<void> {
    await this.getApproveButton().click();
    const dialog = this.getAlertDialog();
    await expect(dialog).toBeVisible();
    if (message) {
      await dialog
        .getByPlaceholder("Optional message to the submitter...")
        .fill(message);
    }
    await dialog.getByRole("button", { name: "Approve" }).click();
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
