import { expect, type Page } from "@playwright/test";
import { waitForZeroReady } from "../fixtures/test";
import { ApprovalDetailPage } from "./approval-detail-page";
import { ListPage } from "./list-page";
import { RequestFormPage } from "./request-form-page";

// Type retained for routing logic (navigateToNew); selectType() removed as UI no longer offers type selection.
type RequestType = "reimbursement" | "advance_payment";
const reimbursementDetailUrlPattern =
  /\/reimbursements\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class ReimbursementPage {
  readonly page: Page;
  readonly list: ListPage;
  readonly form: RequestFormPage;
  readonly detail: ApprovalDetailPage;
  readonly type: RequestType;

  constructor(page: Page, type: RequestType) {
    this.page = page;
    this.type = type;
    this.list = new ListPage(page);
    this.form = new RequestFormPage(page);
    this.detail = new ApprovalDetailPage(page);
  }

  async navigateToList(): Promise<void> {
    await this.page.goto("/reimbursements");
    await waitForZeroReady(this.page);
    await expect(
      this.page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();
  }

  async navigateToNew(): Promise<void> {
    await this.page.goto("/reimbursements/new");
    await waitForZeroReady(this.page);
    await expect(
      this.page.getByRole("heading", { name: "New Reimbursement" })
    ).toBeVisible();
  }

  async selectExpenseDate(): Promise<void> {
    await this.page.getByLabel("Expense Date").click();
    const calendar = this.page.locator('[data-slot="calendar"]');
    await expect(calendar).toBeVisible();
    await calendar.locator('button[aria-current="date"]').click();
    await this.form.getTitleInput().click();
    await expect(
      this.page.locator('[data-slot="popover-content"]')
    ).toBeHidden();
  }

  async waitForDetail(title: string): Promise<void> {
    await this.page.waitForURL(reimbursementDetailUrlPattern, {
      timeout: 10_000,
    });
    await waitForZeroReady(this.page);
    await expect(this.page.getByRole("heading", { name: title })).toBeVisible({
      timeout: 30_000,
    });
  }

  async createReimbursement(titleSuffix: string): Promise<string> {
    const title = `E2E ${titleSuffix} ${Date.now()}`;
    await this.navigateToNew();

    await this.form.selectBankAccount();
    await this.form.fillTitle(title);
    await this.form.selectCity("Bangalore");

    if (this.type === "reimbursement") {
      await this.selectExpenseDate();
    }

    await this.form.fillLineItem({
      amount: this.type === "reimbursement" ? "100" : "200",
      description: "Test item",
    });
    await this.form.submit();
    await this.waitForDetail(title);
    return title;
  }

  async createReimbursementWithVoucher(titleSuffix: string): Promise<string> {
    const title = `E2E ${titleSuffix} ${Date.now()}`;
    await this.navigateToNew();

    await this.form.selectBankAccount();
    await this.form.fillTitle(title);
    await this.form.selectCity("Bangalore");
    await this.selectExpenseDate();

    await this.form.fillLineItem({
      amount: "500",
      description: "Small cash expense",
    });

    await this.form.toggleCashVoucher(0);

    await this.form.submit();
    await this.waitForDetail(title);
    return title;
  }
}
