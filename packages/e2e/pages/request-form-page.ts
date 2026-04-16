import { expect, type Locator, type Page } from "@playwright/test";

export class RequestFormPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  getTitleInput(): Locator {
    return this.page.getByLabel("Title");
  }

  getCityInput(): Locator {
    return this.page.getByLabel("City");
  }

  getSubmitButton(): Locator {
    return this.page.getByRole("button", { name: /Submit|Save changes/ });
  }

  getCancelButton(): Locator {
    return this.page.getByRole("button", { name: "Cancel" });
  }

  getAddLineItemButton(): Locator {
    return this.page.getByRole("button", { name: /add line item/i });
  }

  getDescriptionInputs(): Locator {
    return this.page.getByPlaceholder("Description");
  }

  getAmountInputs(): Locator {
    return this.page.getByPlaceholder("0.00");
  }

  getRemoveButtons(): Locator {
    return this.page.getByRole("button", { name: /remove/i });
  }

  getFieldErrors(): Locator {
    return this.page.locator('[data-slot="field-error"]');
  }

  async fillTitle(title: string): Promise<void> {
    await this.getTitleInput().fill(title);
  }

  async selectCity(cityName: string): Promise<void> {
    await this.getCityInput().click();
    await this.page.getByRole("option", { name: cityName }).click();
  }

  async selectBankAccount(timeout = 25_000): Promise<void> {
    const bankAccountGroup = this.page
      .getByRole("group")
      .filter({ hasText: "Bank Account" });
    const combobox = bankAccountGroup.getByRole("combobox");
    await expect(combobox).toBeVisible({ timeout });

    // If a default is already selected, skip — just verify it has a value
    const text = await combobox.textContent();
    if (text?.includes("••••")) {
      return;
    }

    await combobox.click();
    await expect(this.page.getByRole("option")).toBeVisible({ timeout });
    await this.page.getByRole("option").first().click();
  }

  async fillLineItem(opts: {
    description: string;
    amount: string;
    selectCategory?: boolean;
  }): Promise<void> {
    if (opts.selectCategory !== false) {
      await this.page
        .locator('[data-slot="select-value"]:has-text("Category")')
        .click();
      await this.page.getByRole("option").first().click();
    }
    await this.getDescriptionInputs().last().fill(opts.description);
    await this.getAmountInputs().last().fill(opts.amount);
  }

  async addLineItem(): Promise<void> {
    await this.getAddLineItemButton().click();
  }

  async removeLineItem(index?: number): Promise<void> {
    if (index === undefined) {
      await this.getRemoveButtons().last().click();
    } else {
      await this.getRemoveButtons().nth(index).click();
    }
  }

  async submit(): Promise<void> {
    const btn = this.getSubmitButton();
    // If the submit button is enabled, click it normally.
    // Otherwise (form validation intentionally kept the button disabled),
    // trigger submit via the form element so onSubmit-validation still fires
    // and surfaces field errors. Avoids flake from the mount→validate race
    // where `canSubmit` briefly flips false while Playwright waits for enabled.
    const enabled = await btn.isEnabled().catch(() => false);
    if (enabled) {
      await btn.click();
      return;
    }
    await this.page
      .locator("form")
      .first()
      .evaluate((form: HTMLFormElement) => {
        form.requestSubmit();
      });
  }

  async cancel(): Promise<void> {
    await this.getCancelButton().click();
  }

  getCashVoucherCheckbox(index = 0): Locator {
    return this.page.locator(`#lineItems-${index}-voucher`);
  }

  async toggleCashVoucher(index = 0): Promise<void> {
    await this.page.locator(`label[for="lineItems-${index}-voucher"]`).click();
  }
}
