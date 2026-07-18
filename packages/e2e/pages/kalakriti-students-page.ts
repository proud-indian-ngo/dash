import { expect, type Locator, type Page } from "@playwright/test";
import { waitForZeroReady } from "../fixtures/test";

export class KalakritiStudentsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(year: number) {
    await this.page.goto(`/kalakriti/${year}/students`);
    await waitForZeroReady(this.page);
    await expect(
      this.page.getByRole("heading", { name: "Students" })
    ).toBeVisible();
  }

  async openRegistrationForm(): Promise<Locator> {
    await this.page
      .locator("#main")
      .getByRole("button", { name: "Register Student" })
      .click();
    const dialog = this.page.getByRole("dialog", { name: "Register Student" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async fillStudent(
    dialog: Locator,
    {
      birthDay = "15",
      birthMonth = "Jun",
      birthYear = "2018",
      gender = "Female",
      name,
    }: {
      birthDay?: string;
      birthMonth?: string;
      birthYear?: string;
      gender?: "Female" | "Male";
      name: string;
    }
  ) {
    await dialog.getByLabel("Student name").fill(name);
    await dialog.getByRole("button", { name: "Date of birth" }).click();
    const calendar = this.page.locator('[data-slot="calendar"]');
    await expect(calendar).toBeVisible();
    const dropdowns = calendar.locator("select");
    await dropdowns.nth(1).selectOption({ label: birthYear });
    await dropdowns.nth(0).selectOption({ label: birthMonth });
    const fullMonth = new Date(`${birthMonth} 1, 2000`).toLocaleString(
      "en-US",
      { month: "long" }
    );
    await calendar
      .getByRole("button", {
        name: new RegExp(`${fullMonth}\\s+${Number(birthDay)}`),
      })
      .click();
    await dialog.getByLabel("Gender").click();
    await this.page.getByRole("option", { exact: true, name: gender }).click();
  }

  async register(name: string) {
    const dialog = await this.openRegistrationForm();
    await this.fillStudent(dialog, { name });
    await dialog.getByRole("button", { name: "Register Student" }).click();
    await expect(dialog).toBeHidden();
    return dialog;
  }
}
