import type { Page } from "@playwright/test";

export class KalakritiCompetitionsPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async addCompetition(name: string) {
    await this.page.getByRole("button", { name: "Add Competition" }).click();
    const dialog = this.page.getByRole("dialog", { name: "Add Competition" });
    await dialog.getByLabel("Competition name").fill(name);
    await dialog.getByRole("button", { name: "Create Competition" }).click();
  }

  async addVenue(name: string) {
    await this.page.getByRole("button", { name: "Add Venue" }).click();
    const dialog = this.page.getByRole("dialog", { name: "Add Venue" });
    await dialog.getByLabel("Venue name").fill(name);
    await dialog.getByRole("button", { name: "Create Venue" }).click();
  }

  async goto(year: number) {
    await this.page.goto(`/kalakriti/${year}/competitions`);
  }

  session(competition: string, ageCategory: string) {
    return this.page.getByLabel(`${competition}, ${ageCategory} Session`, {
      exact: true,
    });
  }
}
