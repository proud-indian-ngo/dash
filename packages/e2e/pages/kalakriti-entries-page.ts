import { expect, type Locator, type Page } from "@playwright/test";
import { waitForZeroReady } from "../fixtures/test";

export class KalakritiEntriesPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(year: number, competitionName = "Solo Dance") {
    await this.page.goto(`/kalakriti/${year}/entries`);
    await waitForZeroReady(this.page);
    await expect(
      this.page.getByRole("heading", { exact: true, name: "Entries" })
    ).toBeVisible();
    await this.page
      .getByRole("link", { exact: true, name: competitionName })
      .first()
      .click();
    await expect(
      this.page.getByRole("heading", { name: competitionName })
    ).toBeVisible();
  }

  async openRegistrationForm(): Promise<Locator> {
    await this.page
      .locator("#main")
      .getByRole("button", { name: "Register Entry" })
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: /Register Competition (Entries|Group)/,
    });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async fillEntry(dialog: Locator, studentName: string): Promise<void> {
    await this.fillEntries(dialog, [studentName]);
  }

  async fillEntries(dialog: Locator, studentNames: string[]): Promise<void> {
    for (const studentName of studentNames) {
      // biome-ignore lint/performance/noAwaitInLoops: each selection updates the same combobox before the next search
      await dialog.getByLabel("Students").fill(studentName);
      await this.page
        .getByRole("option", { name: new RegExp(studentName) })
        .click();
    }
  }

  async selectGroupMembers(
    dialog: Locator,
    studentNames: readonly string[]
  ): Promise<void> {
    const studentInput = dialog.getByLabel("Group members");
    for (const studentName of studentNames) {
      // biome-ignore lint/performance/noAwaitInLoops: each selection updates the Combobox before the next Student can be selected
      await studentInput.click();
      await this.page
        .getByRole("option", { name: new RegExp(studentName) })
        .click();
    }
    await studentInput.press("Escape");
  }

  async fillGroup(
    dialog: Locator,
    studentNames: readonly string[]
  ): Promise<void> {
    await this.selectGroupMembers(dialog, studentNames);
  }

  async removeLastGroupMember(dialog: Locator): Promise<void> {
    await dialog.getByLabel("Group members").press("Backspace");
  }

  async register(studentName: string): Promise<void> {
    await this.registerMany([studentName]);
  }

  async registerMany(studentNames: string[]): Promise<void> {
    const dialog = await this.openRegistrationForm();
    await this.fillEntries(dialog, studentNames);
    await dialog.getByRole("button", { name: "Register Entries" }).click();
    await expect(dialog).toBeHidden();
  }
}
