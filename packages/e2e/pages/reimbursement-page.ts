import { expect, type Page } from "@playwright/test";
import { ApprovalDetailPage } from "./approval-detail-page";
import { ListPage } from "./list-page";
import { RequestFormPage } from "./request-form-page";

export class ReimbursementPage {
  readonly page: Page;
  readonly list: ListPage;
  readonly form: RequestFormPage;
  readonly detail: ApprovalDetailPage;

  constructor(page: Page) {
    this.page = page;
    this.list = new ListPage(page);
    this.form = new RequestFormPage(page);
    this.detail = new ApprovalDetailPage(page);
  }

  async navigateToList(): Promise<void> {
    await this.page.goto("/reimbursements");
    await expect(
      this.page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();
    await this.list.waitForZeroTable();
  }

  async navigateToNew(): Promise<void> {
    await this.page.goto("/reimbursements/new");
    await expect(
      this.page.getByRole("heading", { name: "New Reimbursement" })
    ).toBeVisible();
  }

  async selectExpenseDate(): Promise<void> {
    await this.page.getByLabel("Expense Date").click();
    const calendar = this.page.locator('[data-slot="calendar"]');
    await expect(calendar).toBeVisible();
    await calendar.getByRole("button", { name: /^Today/ }).click();
    // Close popover by clicking outside
    await this.form.getTitleInput().click();
    await expect(
      this.page.locator('[data-slot="popover-content"]')
    ).toBeHidden();
  }

  async createReimbursement(titleSuffix: string): Promise<string> {
    const title = `E2E ${titleSuffix} ${Date.now()}`;
    await this.navigateToNew();
    await this.form.fillTitle(title);
    await this.form.selectCity("Bangalore");
    await this.form.selectBankAccount();
    await this.selectExpenseDate();
    await this.form.fillLineItem({
      description: "Test item",
      amount: "100",
    });
    await this.form.submit();
    await this.page.waitForURL(/\/reimbursements\/[a-z0-9-]+$/, {
      timeout: 10_000,
    });
    return title;
  }
}
