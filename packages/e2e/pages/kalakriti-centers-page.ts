import { expect, type Locator, type Page } from "@playwright/test";
import { waitForZeroReady } from "../fixtures/test";

export class KalakritiCentersPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  center(name: string): Locator {
    return this.page
      .getByRole("row")
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  async openDetails(name: string): Promise<Locator> {
    await this.openRowAction(name, "View details");
    const main = this.page.locator("#main");
    await expect(
      main.getByRole("heading", { exact: true, name })
    ).toBeVisible();
    return main;
  }

  async openRowAction(name: string, action: string): Promise<void> {
    await this.center(name)
      .getByRole("button", { name: `Actions for ${name}` })
      .click();
    await this.page
      .getByRole("menuitem", { exact: true, name: action })
      .click();
  }

  studentRegistration(name: string): Locator {
    return this.center(name).getByRole("cell").nth(2);
  }

  participationRegistration(name: string): Locator {
    return this.center(name).getByRole("cell").nth(3);
  }

  async goto(year: number) {
    await expect(async () => {
      await this.page.goto(`/kalakriti/${year}/centers`);
      await waitForZeroReady(this.page, 10_000);
      await expect(
        this.page.getByRole("heading", { exact: true, name: "Centers" })
      ).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 45_000 });
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
    await this.openRowAction(name, "Registration controls");
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
    const detail = await this.openDetails(centerName);
    const picker = detail.getByPlaceholder("Search central volunteers...");
    await picker.fill(volunteerName);
    await this.page
      .getByRole("option", { name: new RegExp(volunteerName) })
      .click();
    await detail.getByRole("button", { name: "Assign Liaison" }).click();
    await expect(
      detail
        .getByRole("list", { name: "Liaisons" })
        .getByText(volunteerName, { exact: true })
    ).toBeVisible();
    await detail.getByRole("link", { name: "Back to Centers" }).click();
    await expect(
      this.page.getByRole("heading", { exact: true, name: "Centers" })
    ).toBeVisible();
  }

  async assignGuardian(centerName: string, guardianName: string) {
    const detail = await this.openDetails(centerName);
    await detail.getByRole("combobox", { name: "Guardian" }).click();
    await this.page
      .getByRole("option", { exact: true, name: guardianName })
      .click();
    await detail.getByRole("button", { name: "Assign Guardian" }).click();
    await expect(
      detail
        .getByRole("list", { name: "Guardians" })
        .getByText(guardianName, { exact: true })
    ).toBeVisible();
    await detail.getByRole("link", { name: "Back to Centers" }).click();
    await expect(
      this.page.getByRole("heading", { exact: true, name: "Centers" })
    ).toBeVisible();
  }
}
