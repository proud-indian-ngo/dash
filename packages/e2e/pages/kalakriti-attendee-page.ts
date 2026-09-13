import { expect, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";
import { ListPage } from "./list-page";

export class KalakritiAttendeePage {
  constructor(readonly page: Page) {}

  async goto(year: number, kind: "Guest" | "Judge") {
    await this.page.goto(
      `/kalakriti/${year}/${kind === "Guest" ? "guests" : "judges"}`
    );
    await waitForZeroReady(this.page);
  }

  async create(
    kind: "Guest" | "Judge",
    name: string,
    phone: string,
    email?: string
  ) {
    await this.page
      .getByRole("button", { name: `Add ${kind}`, exact: true })
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: `Add ${kind}`,
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await dialog
      .getByRole("textbox", { name: "Phone", exact: true })
      .fill(phone);
    if (email)
      await dialog
        .getByRole("textbox", { name: "Email", exact: true })
        .fill(email);
    await dialog
      .getByRole("button", { name: `Create ${kind}`, exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(this.row(name)).toBeVisible();
  }

  row(name: string) {
    return this.page.getByRole("row").filter({ hasText: name });
  }

  async assign(name: string, competitionNames: string[]) {
    await new ListPage(this.page).openRowActionAndClick(
      this.row(name),
      "Assign competitions"
    );
    const dialog = this.page.getByRole("dialog", {
      name: "Assign competitions",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    for (const competition of competitionNames) {
      await dialog
        .getByRole("checkbox", { name: competition, exact: true })
        .check();
    }
    await dialog
      .getByRole("button", { name: "Save assignments", exact: true })
      .click();
    await expect(dialog).toBeHidden();
  }
}
