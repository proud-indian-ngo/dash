import { expect, type Locator, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";

export class KalakritiResultsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get results(): Locator {
    return this.page.getByRole("dialog", { name: "Results" });
  }

  get standings(): Locator {
    return this.page.getByLabel("Center standings", { exact: true });
  }

  async gotoEvent(year: number, divisionId: string) {
    await this.page.goto(`/kalakriti/${year}/entries/${divisionId}`);
    await waitForZeroReady(this.page);
    await expect(this.results).toBeHidden();
    await expect(
      this.page.getByRole("button", { name: /(Assign|Edit|View) results/ })
    ).toBeVisible();
  }

  async openResults() {
    await this.page
      .getByRole("button", { name: /(Assign|Edit|View) results/ })
      .click();
    await expect(this.results).toBeVisible();
    await expect(
      this.results.getByText("Checking current results...")
    ).toBeHidden();
  }

  async gotoDashboard(year: number) {
    await this.page.goto(`/kalakriti/${year}`);
    await waitForZeroReady(this.page);
    await expect(
      this.standings.getByRole("heading", { name: "Center standings" })
    ).toBeVisible();
    await expect(
      this.standings.getByText("Checking current standings...")
    ).toBeHidden();
  }

  async chooseAward(label: "Winner" | "Runner-up", entryName: string) {
    await this.results
      .getByRole("combobox", { name: label, exact: true })
      .click();
    await this.page
      .getByRole("option", { name: new RegExp(entryName) })
      .click();
  }

  async expectCompetitionAwards() {
    await this.page
      .getByRole("button", { name: "Registration breakdown" })
      .click();
    await this.page
      .getByRole("tab", { name: "Competitions", exact: true })
      .click();
    const table = this.page.getByRole("table", { name: /by Competition$/ });
    await expect(
      table.getByRole("columnheader", { name: "Sessions", exact: true })
    ).toHaveCount(0);
    await expect(
      table.getByRole("columnheader", { name: "Winner", exact: true })
    ).toBeVisible();
    await expect(
      table.getByRole("columnheader", { name: "Runner-up", exact: true })
    ).toBeVisible();
    const row = table
      .getByRole("row")
      .filter({ hasText: "Group Dance Results" });
    await expect(row.getByRole("cell").nth(2)).toContainText(
      "Junior: Results Center A"
    );
    await expect(row.getByRole("cell").nth(3)).toContainText(
      "Junior: Results Center B"
    );
    await expect(table).not.toContainText("Results Student");
  }

  async saveDraft() {
    await this.results.getByRole("button", { name: "Save draft" }).click();
    await expect(this.results).toBeHidden();
    await expect(
      this.page.getByRole("button", { name: "Assign results" })
    ).toBeVisible();
    await expect(
      this.page.getByRole("region", { name: "Published results" })
    ).toBeHidden();
  }

  async publish() {
    await this.results.getByRole("button", { name: "Publish results" }).click();
    await expect(this.results).toBeHidden();
    await expect(
      this.page.getByRole("button", { name: "Edit results" })
    ).toBeVisible();
    const summary = this.page.getByRole("region", {
      name: "Published results",
    });
    await expect(summary).toBeVisible();
    await expect(
      summary.getByRole("heading", { name: "Winner", exact: true })
    ).toBeVisible();
    await expect(
      summary.getByRole("heading", { name: "Runner-up", exact: true })
    ).toBeVisible();
    await expect(summary).toContainText("Results Student A");
    await expect(summary).toContainText("Results Student B");
    await expect(summary).toContainText("Results Student C");
    await expect(summary).toContainText("Results Student D");
    await expect(summary).toContainText("Results Center A");
    await expect(summary).toContainText("Results Center B");
  }

  async finalize() {
    await this.standings
      .getByRole("button", { name: "Finalize overall results" })
      .click();
    await expect(
      this.standings.getByText("Final", { exact: true })
    ).toBeVisible();
  }

  async reopen() {
    await this.standings
      .getByRole("button", { name: "Reopen overall results" })
      .click();
    const dialog = this.page.getByRole("alertdialog", {
      name: "Reopen overall results?",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Reopen results" }).click();
    await expect(
      this.standings.getByText("Live", { exact: true })
    ).toBeVisible();
  }
}
