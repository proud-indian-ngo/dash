import { expect, type Page } from "@playwright/test";
import { ApprovalDetailPage } from "./approval-detail-page";
import { ListPage } from "./list-page";
import { RequestFormPage } from "./request-form-page";

export class AdvancePaymentPage {
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
    await this.page.goto("/advance-payments");
    await expect(
      this.page.getByRole("heading", { name: "Advance Payments" })
    ).toBeVisible();
    await this.list.waitForZeroTable();
  }

  async navigateToNew(): Promise<void> {
    await this.page.goto("/advance-payments/new");
    await expect(
      this.page.getByRole("heading", { name: "New Advance Payment" })
    ).toBeVisible();
  }

  async createAdvancePayment(titleSuffix: string): Promise<string> {
    const title = `E2E ${titleSuffix} ${Date.now()}`;
    await this.navigateToNew();
    await this.form.fillTitle(title);
    await this.form.selectCity("Bangalore");
    await this.form.selectBankAccount();
    await this.form.fillLineItem({
      description: "Test item",
      amount: "200",
    });
    await this.form.submit();
    await this.page.waitForURL(/\/advance-payments\/[a-z0-9-]+$/, {
      timeout: 10_000,
    });
    return title;
  }
}
