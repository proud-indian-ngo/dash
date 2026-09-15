import { expect, type Locator, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";
import { ListPage } from "./list-page";

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
    await this.center(name).getByTestId("row-title").click();
    const sheet = this.page.getByRole("dialog", { name, exact: true });
    await expect(sheet).toBeVisible();
    await expect(this.page).toHaveURL(/\/centers\?centerId=/);
    return sheet;
  }

  async openRowAction(name: string, action: string): Promise<void> {
    await new ListPage(this.page).openRowActionAndClick(
      this.center(name),
      action
    );
  }

  async openEdit(name: string): Promise<Locator> {
    await this.openRowAction(name, "Edit");
    const dialog = this.page.getByRole("dialog", {
      name: "Edit Center",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  private async registrationCell(
    name: string,
    header: string
  ): Promise<Locator> {
    const index = await this.page
      .getByRole("columnheader", { name: header })
      .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex);
    return this.center(name).getByRole("cell").nth(index);
  }

  studentRegistration(name: string): Promise<Locator> {
    return this.registrationCell(name, "Student registration");
  }

  participationRegistration(name: string): Promise<Locator> {
    return this.registrationCell(name, "Participation registration");
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

  async assignLiaison(
    centerName: string,
    volunteerName: string,
    role?: "Liaison Lead" | "Liaison Volunteer"
  ) {
    const detail = await this.openEdit(centerName);
    if (role) {
      await detail.getByRole("combobox", { name: "Role" }).click();
      await this.page.getByRole("option", { exact: true, name: role }).click();
    }
    const picker = detail.getByPlaceholder("Search central volunteers...");
    await picker.fill(volunteerName);
    await this.page
      .getByRole("option", { name: new RegExp(volunteerName) })
      .click();
    await detail.getByRole("button", { name: "Assign role" }).click();
    await expect(
      this.page.getByText("Liaison role assigned", { exact: true })
    ).toBeVisible({ timeout: 30_000 });
    const liaisons = detail.getByRole("list", { name: "Liaisons" });
    await expect(
      liaisons.getByText(volunteerName, { exact: true })
    ).toBeVisible();
    if (role) {
      await expect(liaisons.getByText(role, { exact: true })).toBeVisible();
    }
    await detail.getByRole("button", { name: "Close", exact: true }).click();
    await expect(detail).toBeHidden();
  }

  async assignGuardian(centerName: string, guardianName: string) {
    const detail = await this.openEdit(centerName);
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
    await detail.getByRole("button", { name: "Close", exact: true }).click();
    await expect(detail).toBeHidden();
  }
}
