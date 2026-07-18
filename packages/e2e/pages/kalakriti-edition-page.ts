import { expect, type Locator, type Page } from "@playwright/test";

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

  async assignVolunteer(volunteerName: string, responsibility: string) {
    const picker = this.page
      .getByPlaceholder("Search central volunteers...")
      .first();
    await picker.fill(volunteerName);
    await this.page
      .getByRole("option", { name: new RegExp(volunteerName) })
      .first()
      .click();
    await this.page
      .getByRole("combobox")
      .filter({ hasText: "Edition Administrator" })
      .click();
    await this.page
      .getByRole("option", { exact: true, name: responsibility })
      .click();
    await this.page
      .getByRole("button", { exact: true, name: "Assign volunteer" })
      .click();
    await expect(
      this.page.getByText("Volunteer assigned", { exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      this.page.getByRole("button", {
        name: `Remove ${responsibility} from ${volunteerName}`,
      })
    ).toBeVisible();
  }

  async removeVolunteer(volunteerName: string, responsibility: string) {
    await this.page
      .getByRole("button", {
        name: `Remove ${responsibility} from ${volunteerName}`,
      })
      .click();
    const dialog = this.page.getByRole("alertdialog", {
      name: "Remove volunteer responsibility?",
    });
    await dialog.getByRole("button", { name: "Remove responsibility" }).click();
    await expect(
      this.page.getByText("Responsibility removed", { exact: true })
    ).toBeVisible();
    await expect(
      this.page.getByRole("button", {
        name: `Remove ${responsibility} from ${volunteerName}`,
      })
    ).toHaveCount(0);
  }
}
