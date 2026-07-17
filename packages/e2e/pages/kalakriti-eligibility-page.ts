import type { Page } from "@playwright/test";

export class KalakritiEligibilityPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  ageCategory(name: string) {
    return this.page.getByLabel(`${name} Age Category`, { exact: true });
  }

  async addAgeCategory(values: {
    maximumAge: number;
    minimumAge: number;
    name: string;
    order: number;
  }) {
    await this.page.getByRole("button", { name: "Add Age Category" }).click();
    const dialog = this.page.getByRole("dialog", { name: "Add Age Category" });
    await dialog.getByLabel("Category name").fill(values.name);
    await dialog.getByLabel("Minimum age").fill(String(values.minimumAge));
    await dialog.getByLabel("Maximum age").fill(String(values.maximumAge));
    await dialog.getByLabel("Display order").fill(String(values.order));
    await dialog.getByRole("button", { name: "Create Category" }).click();
  }

  async goto(year: number) {
    await this.page.goto(`/kalakriti/${year}/eligibility`);
  }

  async setQuota(
    categoryName: string,
    centerName: string,
    male: number,
    female: number
  ) {
    const card = this.ageCategory(categoryName);
    await card
      .getByRole("button", {
        name: `Set ${categoryName} quota for ${centerName}`,
      })
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: "Center Student quota",
    });
    await dialog
      .getByRole("spinbutton", { name: /^Male Student limit$/ })
      .fill(String(male));
    await dialog
      .getByRole("spinbutton", { name: /^Female Student limit$/ })
      .fill(String(female));
    await dialog.getByRole("button", { name: "Save Quota" }).click();
  }
}
