import { expect, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";

export class KalakritiCompetitionsPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async addCompetition(
    name: string,
    ageCategory = "Junior",
    options: {
      endTime?: string;
      musicUpload?: boolean;
      startTime?: string;
      venue?: string;
    } = {}
  ) {
    await this.page.getByRole("button", { name: "Add Competition" }).click();
    const dialog = this.page.getByRole("dialog", { name: "Add Competition" });
    await dialog.getByLabel("Competition name").fill(name);
    await dialog.getByLabel("Age Categories").fill(ageCategory);
    await this.page.getByRole("option", { name: ageCategory }).click();
    if (options.venue) {
      const division = dialog.getByRole("group", { name: ageCategory });
      await division.getByLabel("Venue").click();
      await this.page.getByRole("option", { name: options.venue }).click();
      await division.getByLabel("Start time").fill(options.startTime ?? "");
      await division.getByLabel("End time").fill(options.endTime ?? "");
    }
    if (options.musicUpload) {
      await dialog.getByRole("switch", { name: "Allow music upload" }).click();
    }
    await dialog.getByRole("button", { name: "Create Competition" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
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
    await this.gotoPage(`/kalakriti/${year}/competitions`, "Competitions");
  }

  async gotoCategories(year: number) {
    await this.gotoPage(
      `/kalakriti/${year}/settings/categories`,
      "Settings",
      "Categories"
    );
  }

  async gotoEditionSettings(year: number) {
    await this.gotoPage(
      `/kalakriti/${year}/settings/edition`,
      "Settings",
      "Edition"
    );
  }

  async gotoEligibility(year: number) {
    await this.gotoPage(
      `/kalakriti/${year}/settings/eligibility`,
      "Settings",
      "Eligibility"
    );
  }

  async gotoVenues(year: number) {
    await this.gotoPage(
      `/kalakriti/${year}/settings/venues`,
      "Settings",
      "Venues"
    );
  }

  private async gotoPage(path: string, title: string, tab?: string) {
    await expect(async () => {
      await this.page.goto(path);
      await waitForZeroReady(this.page, 10_000);
      await expect(
        this.page.getByRole("heading", { exact: true, name: title })
      ).toBeVisible({ timeout: 5000 });
      if (tab) {
        await expect(
          this.page.getByRole("tab", { name: tab, selected: true })
        ).toBeVisible({ timeout: 5000 });
      }
    }).toPass({ timeout: 45_000 });
  }

  competition(name: string) {
    return this.page.getByRole("row").filter({ hasText: name });
  }

  category(name: string) {
    return this.page.getByRole("row").filter({ hasText: name });
  }

  venue(name: string) {
    return this.page.getByRole("row").filter({ hasText: name });
  }
}
