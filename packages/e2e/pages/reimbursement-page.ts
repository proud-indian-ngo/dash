import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";
import { selectRequestEvent } from "../helpers/request-event";
import { ApprovalDetailPage } from "./approval-detail-page";
import { ListPage } from "./list-page";
import { RequestFormPage } from "./request-form-page";

// Type retained for routing logic (navigateToNew); selectType() removed as UI no longer offers type selection.
type RequestType = "reimbursement" | "advance_payment";
const reimbursementDetailUrlPattern =
  /\/reimbursements\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const execFileAsync = promisify(execFile);
const REQUEST_APPROVAL_SCRIPT = path.resolve(
  import.meta.dirname,
  "../helpers/request-approval.ts"
);
const REQUEST_ID_PATTERN = /\/reimbursements\/([0-9a-f-]{36})$/;

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
      this.page.getByRole("heading", { name: "New reimbursement" })
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

  currentRequestId(): string {
    const id = REQUEST_ID_PATTERN.exec(new URL(this.page.url()).pathname)?.[1];
    if (!id) {
      throw new Error(`Not on a request detail page: ${this.page.url()}`);
    }
    return id;
  }

  /**
   * Marks the open request approved in the database, for specs that need an
   * approved request but not the approval itself. Approving in the app needs
   * the payment screenshot promoted in R2, which CI does not have.
   */
  async approveInDatabase(): Promise<void> {
    await this.runApprovalFixture("approve");
    await expect(this.detail.getStatusBadge("Approved")).toBeVisible({
      timeout: 15_000,
    });
  }

  /**
   * Marks the open reimbursement rejected while it keeps a stored payment
   * screenshot, as when an approved request is later rejected.
   */
  async rejectWithStoredScreenshotInDatabase(): Promise<void> {
    await this.runApprovalFixture("reject-with-screenshot");
    await expect(this.detail.getStatusBadge("Rejected")).toBeVisible({
      timeout: 15_000,
    });
  }

  private async runApprovalFixture(action: string): Promise<void> {
    await execFileAsync(
      "bun",
      [
        "run",
        REQUEST_APPROVAL_SCRIPT,
        action,
        this.type === "reimbursement" ? "reimbursement" : "advance-payment",
        this.currentRequestId(),
      ],
      { env: process.env }
    );
  }

  async createReimbursement(
    titleSuffix: string,
    event?: { city: string; name: string }
  ): Promise<string> {
    const title = `E2E ${titleSuffix} ${Date.now()}`;
    await this.navigateToNew();

    await this.form.selectBankAccount();
    await this.form.fillTitle(title);
    if (event) {
      await selectRequestEvent(this.page, event.name, event.city);
    } else {
      await this.form.selectCity("Bangalore");
    }

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
