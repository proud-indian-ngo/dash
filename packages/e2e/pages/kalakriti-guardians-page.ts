import { expect, type Page } from "@playwright/test";

export class KalakritiGuardiansPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(year: number) {
    await this.page.goto(`/kalakriti/${year}/guardians`);
    await expect(
      this.page.getByRole("heading", { name: `Kalakriti ${year}` })
    ).toBeVisible();
    await expect(
      this.page.getByRole("button", { name: "Invite Guardian" })
    ).toBeVisible();
  }

  async requestDormantIdentityReuse({
    email,
    name,
  }: {
    email: string;
    name: string;
  }) {
    await this.page.getByRole("button", { name: "Invite Guardian" }).click();
    const dialog = this.page.getByRole("dialog", { name: "Invite Guardian" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(name);
    await dialog.getByRole("textbox", { name: "Email" }).fill(email);
    await dialog.getByRole("button", { name: "Invite Guardian" }).click();
    await expect(
      this.page.getByRole("alertdialog", {
        name: "Reuse dormant Guardian account?",
      })
    ).toBeVisible();
  }

  confirmReuse() {
    return this.page
      .getByRole("alertdialog", { name: "Reuse dormant Guardian account?" })
      .getByRole("button", { name: "Reuse account" })
      .click();
  }

  async requestArchive(name: string) {
    await expect(this.page.getByText(name, { exact: true })).toBeVisible();
    await this.page
      .getByRole("button", { name: `Archive access for ${name}` })
      .click();
    await expect(
      this.page.getByRole("alertdialog", {
        name: "Archive Guardian access?",
      })
    ).toBeVisible();
  }

  confirmArchive() {
    return this.page
      .getByRole("alertdialog", { name: "Archive Guardian access?" })
      .getByRole("button", { name: "Archive access" })
      .click();
  }
}
