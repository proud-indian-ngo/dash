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

  async gotoCatalog(year: number) {
    await this.page.goto(`/kalakriti/${year}/competitions/catalog`);
  }

  async gotoCategories(year: number) {
    await this.page.goto(`/kalakriti/${year}/competitions/categories`);
  }

  async gotoSchedule(year: number) {
    await this.page.goto(`/kalakriti/${year}/competitions/schedule`);
  }

  async gotoVenues(year: number) {
    await this.page.goto(`/kalakriti/${year}/competitions/venues`);
  }

  competition(name: string) {
    return this.page.getByRole("row").filter({ hasText: name });
  }

  category(name: string) {
    return this.page.getByRole("row").filter({ hasText: name });
  }

  session(competition: string, ageCategory: string) {
    return this.page
      .getByRole("row")
      .filter({ hasText: competition })
      .filter({ hasText: ageCategory });
  }

  venue(name: string) {
    return this.page.getByRole("row").filter({ hasText: name });
  }
}
