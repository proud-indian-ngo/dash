import type { Page } from "@playwright/test";

export class KalakritiEligibilityPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  ageCategory(name: string) {
    return this.page.getByRole("row").filter({ hasText: name });
  }

  async addAgeCategory(values: {
    femaleStudentLimit: number;
    maleStudentLimit: number;
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
    await dialog
      .getByRole("spinbutton", { name: /^Male Students per Center/ })
      .fill(String(values.maleStudentLimit));
    await dialog
      .getByRole("spinbutton", { name: /^Female Students per Center/ })
      .fill(String(values.femaleStudentLimit));
    await dialog.getByRole("button", { name: "Create Category" }).click();
  }

  async goto(year: number) {
    await this.page.goto(`/kalakriti/${year}/eligibility`);
  }

  async editStudentLimits(categoryName: string, male: number, female: number) {
    await this.ageCategory(categoryName).click();
    const dialog = this.page.getByRole("dialog", { name: "Edit Age Category" });
    await dialog
      .getByRole("spinbutton", { name: /^Male Students per Center/ })
      .fill(String(male));
    await dialog
      .getByRole("spinbutton", { name: /^Female Students per Center/ })
      .fill(String(female));
    await dialog.getByRole("button", { name: "Save Category" }).click();
  }
}
