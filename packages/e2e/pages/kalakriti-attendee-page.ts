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

  async verifyTableControls(kind: "Guest" | "Judge", name: string) {
    const search = this.page.getByPlaceholder(`Search ${kind}s...`);
    await search.fill("no matching attendee");
    await expect(this.row(name)).toHaveCount(0);
    await search.fill("");
    await expect(this.row(name)).toBeVisible();
    await this.page
      .getByRole("button", { name: "Columns", exact: true })
      .click();
    const email = this.page.getByRole("menuitemcheckbox", {
      name: "Email",
      exact: true,
    });
    const emailHeader = this.page.getByRole("columnheader").filter({
      has: this.page.getByRole("button", { name: "Email", exact: true }),
    });
    await email.click();
    await expect(emailHeader).toHaveCount(0);
    await email.click();
    await this.page.keyboard.press("Escape");
    await expect(emailHeader).toBeVisible();
    await expect(
      emailHeader.getByRole("button", { name: "Drag to reorder", exact: true })
    ).toBeVisible();
    await expect(
      emailHeader.getByRole("separator", { name: "Resize column", exact: true })
    ).toBeVisible();
  }

  row(name: string) {
    return this.page.getByRole("row").filter({ hasText: name });
  }

  async editJudge(name: string, nextName: string) {
    await this.row(name).getByTestId("row-title").click();
    const sheet = this.page.getByRole("dialog", { name, exact: true });
    await expect(
      sheet.getByRole("button", { name: "Assign competitions", exact: true })
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Archive", exact: true })
    ).toHaveCount(0);
    await expect(
      sheet.getByRole("button", { name: "Delete", exact: true })
    ).toBeVisible();
    await sheet.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = this.page.getByRole("dialog", {
      name: "Edit Judge",
      exact: true,
    });
    await expect(
      dialog.getByRole("textbox", { name: "Name", exact: true })
    ).toHaveValue(name);
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(nextName);
    await dialog
      .getByRole("button", { name: "Save details", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(this.row(nextName)).toBeVisible();
  }

  async deleteJudge(name: string) {
    await new ListPage(this.page).openRowActionAndClick(
      this.row(name),
      "Delete"
    );
    const dialog = this.page.getByRole("alertdialog", {
      name: "Delete Judge?",
      exact: true,
    });
    await expect(dialog).toContainText("This cannot be undone");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(this.row(name)).toHaveCount(0);
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
    await expect(
      dialog.getByRole("button", { name: "Save assignments", exact: true })
    ).toBeVisible();
    for (const checkbox of await dialog.getByRole("checkbox").all())
      await checkbox.uncheck();
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
