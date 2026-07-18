import { expect, type Locator, type Page } from "@playwright/test";
import { waitForZeroReady } from "../fixtures/test";

export class KalakritiEntriesPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(year: number) {
    await this.page.goto(`/kalakriti/${year}/entries`);
    await waitForZeroReady(this.page);
    await expect(
      this.page.getByRole("heading", { name: "Competition Entries" })
    ).toBeVisible();
  }

  async openRegistrationForm(): Promise<Locator> {
    await this.page
      .locator("#main")
      .getByRole("button", { name: "Register Entry" })
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: "Register Competition Entry",
    });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async fillEntry(dialog: Locator, studentName: string): Promise<void> {
    await dialog.getByLabel("Student").click();
    await this.page
      .getByRole("option", { name: new RegExp(studentName) })
      .click();
    await dialog.getByLabel("Competition Session").click();
    await this.page.getByRole("option", { name: /Solo Dance/ }).click();
  }

  async register(studentName: string): Promise<void> {
    const dialog = await this.openRegistrationForm();
    await this.fillEntry(dialog, studentName);
    await dialog.getByRole("button", { name: "Register Entry" }).click();
    await expect(dialog).toBeHidden();
  }
}
