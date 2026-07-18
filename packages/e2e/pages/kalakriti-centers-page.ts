import { expect, type Locator, type Page } from "@playwright/test";

export class KalakritiCentersPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  center(name: string): Locator {
    return this.page.getByLabel(`${name} Center`);
  }

  async goto(year: number) {
    await this.page.goto(`/kalakriti/${year}/centers`);
    await expect(
      this.page.getByRole("heading", { name: `Kalakriti ${year}` })
    ).toBeVisible();
    await expect(
      this.page.getByRole("heading", { name: "Centers" })
    ).toBeVisible({ timeout: 30_000 });
  }

  async addCenter(name: string) {
    await this.page.getByRole("button", { name: "Add Center" }).click();
    const dialog = this.page.getByRole("dialog", { name: "Add Center" });
    await dialog.getByRole("textbox", { name: "Center name" }).fill(name);
    await dialog.getByRole("button", { name: "Create Center" }).click();
    await expect(this.center(name)).toBeVisible();
  }

  async configureRegistration(
    name: string,
    options: { participation: boolean; students: boolean }
  ) {
    await this.center(name)
      .getByRole("button", { name: "Registration controls" })
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: "Registration controls",
    });
    const students = dialog.getByRole("switch", {
      name: "Student registration",
    });
    const participation = dialog.getByRole("switch", {
      name: "Event participation registration",
    });
    if ((await students.isChecked()) !== options.students) {
      await students.click();
    }
    if ((await participation.isChecked()) !== options.participation) {
      await participation.click();
    }
    const confirmation = dialog.getByRole("switch", {
      name: "I confirm registration should reopen",
    });
    if (await confirmation.isVisible()) {
      await confirmation.click();
    }
    await dialog.getByRole("button", { name: "Save controls" }).click();
  }

  async assignLiaison(centerName: string, volunteerName: string) {
    const card = this.center(centerName);
    const picker = card.getByPlaceholder("Search central volunteers...");
    await picker.fill(volunteerName);
    await this.page
      .getByRole("option", { name: new RegExp(volunteerName) })
      .click();
    await card.getByRole("button", { name: "Assign Liaison" }).click();
    await expect(
      card
        .getByRole("list", { name: "Liaisons" })
        .getByText(volunteerName, { exact: true })
    ).toBeVisible();
  }

  async assignGuardian(centerName: string, guardianName: string) {
    const card = this.center(centerName);
    await card.getByRole("combobox", { name: "Guardian" }).click();
    await this.page
      .getByRole("option", { exact: true, name: guardianName })
      .click();
    await card.getByRole("button", { name: "Assign Guardian" }).click();
    await expect(
      card
        .getByRole("list", { name: "Guardians" })
        .getByText(guardianName, { exact: true })
    ).toBeVisible();
  }
}
