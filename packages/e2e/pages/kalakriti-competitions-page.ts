import { expect, type Page } from "@playwright/test";
import { waitForZeroReady } from "../fixtures/test";

export class KalakritiCompetitionsPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async addCompetition(name: string, ageCategory = "Junior") {
    await this.page.getByRole("button", { name: "Add Competition" }).click();
    const dialog = this.page.getByRole("dialog", { name: "Add Competition" });
    await dialog.getByLabel("Competition name").fill(name);
    await dialog.getByLabel("Age Categories").fill(ageCategory);
    await this.page.getByRole("option", { name: ageCategory }).click();
    await dialog.getByRole("button", { name: "Create Competition" }).click();
    await expect(
      this.page.getByText("Competition created", { exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(this.competition(name)).toBeVisible({ timeout: 30_000 });
  }

  async addVenue(name: string) {
    await this.page.getByRole("button", { name: "Add Venue" }).click();
    const dialog = this.page.getByRole("dialog", { name: "Add Venue" });
    await dialog.getByLabel("Venue name").fill(name);
    await dialog.getByRole("button", { name: "Create Venue" }).click();
    await expect(
      this.page.getByText("Venue created", { exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(this.venue(name)).toBeVisible({ timeout: 30_000 });
  }

  async goto(year: number) {
    await this.gotoPage(
      `/kalakriti/${year}/competitions`,
      "Competition overview"
    );
  }

  async gotoCatalog(year: number) {
    await this.gotoPage(
      `/kalakriti/${year}/competitions/catalog`,
      "Competitions"
    );
  }

  async gotoCategories(year: number) {
    await this.gotoPage(
      `/kalakriti/${year}/competitions/categories`,
      "Competition Categories"
    );
  }

  async gotoSchedule(year: number) {
    await this.gotoPage(
      `/kalakriti/${year}/competitions/schedule`,
      "Competition schedule"
    );
  }

  async gotoVenues(year: number) {
    await this.gotoPage(`/kalakriti/${year}/competitions/venues`, "Venues");
  }

  private async gotoPage(path: string, heading: string) {
    await expect(async () => {
      await this.page.goto(path);
      await waitForZeroReady(this.page, 10_000);
      await expect(
        this.page.getByRole("heading", { exact: true, name: heading })
      ).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 45_000 });
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
