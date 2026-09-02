import { expect, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";

export class KalakritiGuardiansPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(year: number) {
    await expect(async () => {
      await this.page.goto(`/kalakriti/${year}/guardians`);
      await waitForZeroReady(this.page, 10_000);
      await expect(
        this.page.getByRole("heading", { exact: true, name: "Guardians" })
      ).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 45_000 });
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
      .getByRole("button", { name: `Actions for ${name}` })
      .click();
    await this.page
      .getByRole("menuitem", { exact: true, name: "Archive access" })
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

  async editDetails({
    currentName,
    email,
    name,
    phone,
  }: {
    currentName: string;
    email: string;
    name: string;
    phone: string;
  }) {
    await expect(
      this.page.getByText(currentName, { exact: true })
    ).toBeVisible();
    await expect(async () => {
      await this.page
        .getByRole("button", { name: `Actions for ${currentName}` })
        .click();
      await this.page
        .getByRole("menuitem", { exact: true, name: "Edit details" })
        .click();
    }).toPass();
    const dialog = this.page.getByRole("dialog", {
      name: "Edit Guardian details",
    });
    await expect(dialog).toBeVisible();
    const nameInput = dialog.getByRole("textbox", { name: "Name" });
    await expect(nameInput).toHaveValue(currentName);
    await nameInput.fill(name);
    const emailInput = dialog.getByRole("textbox", { name: "Email" });
    await expect(emailInput).not.toHaveValue("");
    await emailInput.fill(email);
    await dialog.getByLabel("Phone").last().fill(phone);
    await dialog.getByRole("button", { name: "Save details" }).click();
  }
}
