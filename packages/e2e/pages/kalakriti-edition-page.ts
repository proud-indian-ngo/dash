import { errors, expect, type Locator, type Page } from "@playwright/test";

const { TimeoutError } = errors;

export class KalakritiEditionPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private async chooseDate(
    form: Locator,
    label: string,
    year: string,
    month: string,
    monthIndex: number,
    day: number
  ) {
    await form.getByLabel(label).click();
    await this.page.getByLabel("Choose the Year").last().selectOption(year);
    await this.page
      .getByLabel("Choose the Month")
      .last()
      .selectOption({ index: monthIndex });
    await this.page
      .getByRole("button", { name: new RegExp(`${month} ${day}.*, ${year}`) })
      .click();
  }

  async create({ name, year }: { name: string; year: number }) {
    await this.page.goto("/kalakriti/new");
    const form = this.page.getByRole("main");
    await expect(
      form.getByRole("heading", { name: "Create Kalakriti Edition" })
    ).toBeVisible();
    await form.getByLabel("Year").fill(String(year));
    await form.getByLabel("Edition name").fill(name);
    await form.getByLabel("Owning team").click();
    await this.page.getByRole("option").first().click();
    await this.chooseDate(form, "Event date", String(year), "November", 10, 20);
    await this.chooseDate(form, "Age cutoff date", String(year), "June", 5, 30);
    await this.chooseDate(
      form,
      "Registration close date",
      String(year),
      "October",
      9,
      31
    );
    await form.getByLabel("Registration close time (IST)").click();
    await this.page.getByRole("option", { name: "18:00" }).click();
    await form.getByLabel("Branding key").fill(`kalakriti-${year}-e2e`);
    await form.getByRole("button", { name: "Create Edition" }).click();
    await expect(this.page).toHaveURL(`/kalakriti/${year}`);
    await expect(
      this.page.getByText(`Kalakriti ${year} created`, { exact: true })
    ).toBeVisible();
  }

  async goto(year: number) {
    await this.page.goto(`/kalakriti/${year}`);
    await expect(
      this.page.getByRole("heading", { name: `Kalakriti ${year}` })
    ).toBeVisible();
  }

  async chooseAdminAction(name: string) {
    const trigger = this.page.getByRole("button", { name: "Admin actions" });
    const menuItem = this.page.getByRole("menuitem", { name });

    const tryClick = async (attempt: number): Promise<boolean> => {
      try {
        await trigger.click({ timeout: 5000 });
        await expect(menuItem).toBeVisible({ timeout: 3000 });
        await menuItem.click({ timeout: 3000 });
        return true;
      } catch (caughtError) {
        if (this.page.isClosed()) {
          throw new Error("Page closed during retry", { cause: caughtError });
        }
        if (!(caughtError instanceof TimeoutError)) {
          throw caughtError;
        }
        await this.page.keyboard.press("Escape").catch(() => {
          // Ignore — page may have navigated
        });
        await this.page.waitForTimeout(500);
        if (attempt >= 4) {
          return false;
        }
        return tryClick(attempt + 1);
      }
    };
    if (await tryClick(0)) {
      return;
    }
    await trigger.click();
    await menuItem.click();
  }

  async expectAdminAction(name: string) {
    await this.page.getByRole("button", { name: "Admin actions" }).click();
    await expect(this.page.getByRole("menuitem", { name })).toBeVisible();
    await this.page.keyboard.press("Escape");
  }

  async editMinimumCompetitions(minimum: number) {
    await this.page.getByRole("button", { name: /^Min \d+$/ }).click();
    const dialog = this.page.getByRole("dialog", {
      name: "Edit minimum Competitions",
    });
    const input = dialog.getByLabel("Minimum Competitions");
    await expect(input).toHaveValue("2");
    await input.fill(String(minimum));
    await dialog.getByRole("button", { name: "Save minimum" }).click();
    await expect(
      this.page.getByText("Minimum Competitions updated", { exact: true })
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(
      this.page.getByRole("button", { name: `Min ${minimum}` })
    ).toBeVisible();
  }

  async editDetails({ name, year }: { name: string; year: number }) {
    await this.page
      .getByRole("button", { name: "Edit Edition details" })
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: "Edit Edition details",
    });
    const nameInput = dialog.getByLabel("Edition name");
    await expect(nameInput).toHaveValue(`Kalakriti ${year}`);
    await nameInput.fill(name);
    await this.chooseDate(
      dialog,
      "Event date",
      String(year),
      "November",
      10,
      21
    );
    await dialog.getByLabel("Branding key").fill(`kalakriti-${year}-updated`);
    await dialog.getByRole("button", { name: "Save details" }).click();
    await expect(
      this.page.getByText("Edition details updated", { exact: true })
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(
      this.page.getByRole("heading", { exact: true, name })
    ).toBeVisible();
  }

  async gotoVolunteers(year: number) {
    await this.page.goto(`/kalakriti/${year}/volunteers`);
    await expect(
      this.page.getByRole("heading", { name: "Volunteers" })
    ).toBeVisible();
  }

  async addVolunteers(volunteerName: string) {
    await this.page.getByRole("button", { name: "Add volunteers" }).click();
    const dialog = this.page.getByRole("dialog", { name: "Add volunteers" });
    const picker = dialog.getByPlaceholder("Search central volunteers...");
    await picker.fill(volunteerName);
    await this.page
      .getByRole("option", { name: new RegExp(volunteerName) })
      .first()
      .click();
    await dialog
      .getByRole("button", { exact: true, name: "Add volunteers" })
      .click();
    await expect(
      this.page.getByText("Volunteers added", { exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toHaveCount(0);
    await expect(
      this.page.getByText(volunteerName, { exact: true })
    ).toBeVisible();
    await expect(
      this.page.getByText("Unassigned", { exact: true })
    ).toBeVisible();
  }

  async assignRoleFromRow(
    volunteerName: string,
    responsibility: string,
    scope?: { center?: string }
  ) {
    await this.page
      .getByRole("button", { name: `Actions for ${volunteerName}` })
      .click();
    await this.page.getByRole("menuitem", { name: "Assign role" }).click();
    const dialog = this.page.getByRole("dialog", { name: "Assign role" });
    await dialog.locator("#responsibility").click();
    await this.page
      .getByRole("option", { exact: true, name: responsibility })
      .click();
    if (scope?.center) {
      await dialog.getByRole("combobox", { name: "Center" }).click();
      await this.page
        .getByRole("option", { exact: true, name: scope.center })
        .click();
    }
    await dialog
      .getByRole("button", { exact: true, name: "Assign role" })
      .click();
    await expect(
      this.page.getByText("Role assigned", { exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toHaveCount(0);
  }

  async assignVolunteer(volunteerName: string, responsibility: string) {
    await this.addVolunteers(volunteerName);
    await this.assignRoleFromRow(volunteerName, responsibility);
  }

  async removeVolunteer(volunteerName: string, responsibility: string) {
    await this.page
      .getByRole("button", { name: `Actions for ${volunteerName}` })
      .click();
    await this.page
      .getByRole("menuitem", { name: `Remove ${responsibility}` })
      .click();
    const confirm = this.page.getByRole("alertdialog", {
      name: "Remove volunteer responsibility?",
    });
    await confirm
      .getByRole("button", { name: "Remove responsibility" })
      .click();
    await expect(
      this.page.getByText("Responsibility removed", { exact: true })
    ).toBeVisible();
    await expect(
      this.page.getByRole("menuitem", { name: `Remove ${responsibility}` })
    ).toHaveCount(0);
  }

  async removeFromEdition(volunteerName: string) {
    await this.page
      .getByRole("button", { name: `Actions for ${volunteerName}` })
      .click();
    await this.page
      .getByRole("menuitem", { name: "Remove from Edition" })
      .click();
    const confirm = this.page.getByRole("alertdialog", {
      name: "Remove volunteer from Edition?",
    });
    await confirm.getByRole("button", { name: "Remove from Edition" }).click();
    await expect(
      this.page.getByText("Volunteer removed from Edition", { exact: true })
    ).toBeVisible();
  }
}
